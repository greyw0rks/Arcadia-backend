// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
// QuizArcade v2
//
// Changes from v1:
//  • Multi-token — one contract accepts any whitelisted ERC-20 (USDm, USDC, USDT).
//  • EIP-712 Settlement now includes `token` — prevents cross-token signature replay.
//  • emergencyWithdraw — owner can sweep free + pool funds when paused; preserves
//    lockedForSessions so players can still cancel after a drain (prior v1 bug).
//  • batchCancelExpired — cancel many stale sessions in one tx.
//  • fundPool — explicit pool-funding with event; raw transfers still work via balance math.
//  • Richer events — token address included in SessionStarted / SessionSettled / SessionCancelled.
//  • Cleaner errors — parameterised where useful (Insolvent carries available/required).
//  • Per-token maxStake — fixes the decimal mismatch when mixing 6-dec (USDC/USDT) and
//    18-dec (USDm) tokens in a single deployment.
//  • Reserve sized from session maxRounds (not the global maxRoundsCap cap) for capital efficiency.
//  • CELO ERC-20 guard in enableToken (Celo token duality: CELO is both native and ERC-20 at
//    0x471EcE3750Da237f93B8E339c536989b8978a438; enabling it would make balanceOf include
//    native CELO, inflating the solvency check).
//  • Removed feeRecipient — rake goes straight to freeTreasury[token] (owner withdraws).
//  • Version bumped to "2" in EIP-712 domain so old signatures never validate here.
// ─────────────────────────────────────────────────────────────────────────────

import {Ownable}        from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable}       from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712}         from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA}          from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20}         from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}      from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract QuizArcade is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant BPS          = 10_000;
    uint256 public constant STEP_BPS     = 1_000;   // +/-0.1x per round
    uint16  public constant MAX_RAKE_BPS = 2_000;   // hard cap: 20%

    // CELO's ERC-20 address on mainnet. Because CELO is simultaneously a native token and an
    // ERC-20, enabling it would make `balanceOf(address(this))` include native CELO from gas
    // refunds or accidental sends, inflating the solvency check with phantom funds.
    address private constant CELO_ERC20 = 0x471EcE3750Da237f93B8E339c536989b8978a438;

    bytes32 private constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(bytes32 sessionId,uint256 multiplierBp,address token)"
    );

    // ── Global config (owner-settable) ────────────────────────────────────────

    address public trustedSigner;

    uint16  public rakeBps;       // rake in basis points (e.g. 300 = 3%)
    uint8   public maxRoundsCap;  // upper bound on maxRounds per session
    uint64  public sessionTtl;    // seconds until a session can be cancelled

    // ── Token whitelist ───────────────────────────────────────────────────────

    mapping(address => bool) public tokenEnabled;

    // Per-token stake cap in the token's own units. Must be set when enabling a token.
    // Separate caps are required because tokens have different decimals (USDm = 18, USDC/USDT = 6):
    // a $1 cap for USDm is 1e18; for USDC it is 1e6. A single shared value cannot represent both.
    mapping(address => uint256) public maxStake;

    // ── Per-token treasury accounting ─────────────────────────────────────────

    /// Accumulated rake — owner can withdraw via withdrawFree.
    mapping(address => uint256) public freeTreasury;

    /// Sum of reserves locked in open sessions (decremented on settle/cancel).
    mapping(address => uint256) public lockedForSessions;

    // ── Session storage ───────────────────────────────────────────────────────

    struct Session {
        address player;
        address token;
        uint256 effectiveStake; // stake net of rake (returned on cancel; base for payout)
        uint256 reserve;        // max possible payout locked from pool (effectiveStake × maxMult)
        uint64  expiry;
        uint8   maxRounds;
        bool    settled;        // true after settle() or cancelExpired()
    }

    mapping(bytes32 => Session) private _sessions;

    // ── Custom errors ─────────────────────────────────────────────────────────

    error ZeroAddress();
    error ZeroStake();
    error StakeTooHigh(uint256 stake, uint256 max);
    error InvalidMaxRounds(uint8 provided, uint8 cap);
    error TokenNotEnabled(address token);
    error CELONotAllowed();
    error SessionExists();
    error UnknownSession();
    error AlreadySettled();
    error NotExpired();
    error Insolvent(uint256 available, uint256 required);
    error BadSignature();
    error AmountExceedsFree(uint256 requested, uint256 available);
    error RakeTooHigh(uint16 provided, uint16 max);

    // ── Events ────────────────────────────────────────────────────────────────

    event SessionStarted(
        bytes32 indexed sessionId,
        address indexed player,
        address indexed token,
        uint256 stake,
        uint256 effectiveStake,
        uint256 reserve,
        uint8   maxRounds,
        uint64  expiry
    );
    event SessionSettled(
        bytes32 indexed sessionId,
        address indexed player,
        address indexed token,
        uint256 multiplierBp,
        uint256 payout
    );
    event SessionCancelled(
        bytes32 indexed sessionId,
        address indexed player,
        address indexed token,
        uint256 refund
    );
    event PoolFunded(address indexed token, address indexed funder, uint256 amount);
    event FreeWithdrawn(address indexed token, uint256 amount, address to);
    event EmergencyWithdraw(address indexed token, uint256 amount, address to);
    event SignerUpdated(address oldSigner, address newSigner);
    event TokenEnabled(address token, bool enabled);
    event MaxStakeSet(address token, uint256 maxStake);

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address owner_,
        address signer_,
        uint16  rakeBps_,
        uint8   maxRoundsCap_,
        uint64  sessionTtl_
    ) Ownable(owner_) EIP712("QuizArcade", "2") {
        if (signer_ == address(0)) revert ZeroAddress();
        if (rakeBps_ > MAX_RAKE_BPS) revert RakeTooHigh(rakeBps_, MAX_RAKE_BPS);
        trustedSigner  = signer_;
        rakeBps        = rakeBps_;
        maxRoundsCap   = maxRoundsCap_;
        sessionTtl     = sessionTtl_;
    }

    // ── Core: start ───────────────────────────────────────────────────────────

    /**
     * @notice Lock a stake and open a game session.
     * @param sessionId  Unique 32-byte id generated by the trusted backend.
     * @param token      ERC-20 stake token (must be whitelisted).
     * @param stake      Gross stake amount in token units (rake is taken from this).
     * @param maxRounds  Number of rounds committed; determines max multiplier.
     */
    function startSession(
        bytes32 sessionId,
        address token,
        uint256 stake,
        uint8   maxRounds
    ) external nonReentrant whenNotPaused {
        if (!tokenEnabled[token])                     revert TokenNotEnabled(token);
        if (stake == 0)                               revert ZeroStake();
        if (stake > maxStake[token])                  revert StakeTooHigh(stake, maxStake[token]);
        if (maxRounds == 0 || maxRounds > maxRoundsCap)
                                                      revert InvalidMaxRounds(maxRounds, maxRoundsCap);
        if (_sessions[sessionId].player != address(0)) revert SessionExists();

        // Pull stake from player.
        IERC20(token).safeTransferFrom(msg.sender, address(this), stake);

        // Rake: goes to freeTreasury immediately.
        uint256 rake           = stake * rakeBps / BPS;
        uint256 effectiveStake = stake - rake;
        freeTreasury[token]   += rake;

        // Reserve: the maximum possible payout for THIS session (effectiveStake × maxMult for maxRounds).
        // Sized against the session's committed maxRounds — not the global cap — for capital efficiency.
        uint256 maxMult = BPS + STEP_BPS * uint256(maxRounds);
        uint256 reserve = effectiveStake * maxMult / BPS;

        // Solvency check.
        // After the safeTransferFrom above, balanceOf includes `stake`.
        // available = balance − freeTreasury − lockedForSessions
        //           = (old_balance + stake) − (old_free + rake) − old_locked
        //           = old_pool + effectiveStake
        // We need available ≥ reserve, i.e. the pool can cover max payout.
        uint256 balance   = IERC20(token).balanceOf(address(this));
        uint256 available = balance - freeTreasury[token] - lockedForSessions[token];
        if (available < reserve) revert Insolvent(available, reserve);

        lockedForSessions[token] += reserve;

        uint64 expiry = uint64(block.timestamp + sessionTtl);
        _sessions[sessionId] = Session({
            player:         msg.sender,
            token:          token,
            effectiveStake: effectiveStake,
            reserve:        reserve,
            expiry:         expiry,
            maxRounds:      maxRounds,
            settled:        false
        });

        emit SessionStarted(sessionId, msg.sender, token, stake, effectiveStake, reserve, maxRounds, expiry);
    }

    // ── Core: settle ──────────────────────────────────────────────────────────

    /**
     * @notice Settle a completed session using a backend-signed multiplier.
     *         Callable by anyone — the EIP-712 signature from the trusted signer
     *         is the authorisation mechanism.
     */
    function settle(
        bytes32 sessionId,
        uint256 multiplierBp,
        bytes calldata signature
    ) external nonReentrant {
        Session storage s = _sessions[sessionId];
        if (s.player == address(0)) revert UnknownSession();
        if (s.settled)              revert AlreadySettled();

        // Verify EIP-712 signature (includes token to prevent cross-token replay).
        bytes32 structHash = keccak256(
            abi.encode(SETTLEMENT_TYPEHASH, sessionId, multiplierBp, s.token)
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != trustedSigner)
            revert BadSignature();

        // Clamp multiplier to session maximum.
        uint256 maxMult = BPS + STEP_BPS * uint256(s.maxRounds);
        if (multiplierBp > maxMult) multiplierBp = maxMult;

        uint256 payout = s.effectiveStake * multiplierBp / BPS;

        s.settled = true;
        lockedForSessions[s.token] -= s.reserve;

        IERC20(s.token).safeTransfer(s.player, payout);
        emit SessionSettled(sessionId, s.player, s.token, multiplierBp, payout);
    }

    // ── Core: cancel ─────────────────────────────────────────────────────────

    /// @notice Cancel a single expired session and refund the player's effectiveStake.
    function cancelExpired(bytes32 sessionId) external nonReentrant {
        _cancel(sessionId);
    }

    /**
     * @notice Cancel multiple expired sessions in one transaction.
     *         Skips sessions that are not cancellable (already settled, not expired,
     *         or unknown) so the whole batch never reverts on a bad entry.
     */
    function batchCancelExpired(bytes32[] calldata sessionIds) external nonReentrant {
        for (uint256 i; i < sessionIds.length; ++i) {
            Session storage s = _sessions[sessionIds[i]];
            if (
                s.player == address(0) ||
                s.settled              ||
                block.timestamp < s.expiry
            ) continue;
            _cancelSession(sessionIds[i], s);
        }
    }

    // ── Pool funding ──────────────────────────────────────────────────────────

    /**
     * @notice Deposit tokens into the payout pool (for house funds).
     *         Anyone can call this; direct transfers work too (no event then).
     */
    function fundPool(address token, uint256 amount) external {
        if (!tokenEnabled[token]) revert TokenNotEnabled(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit PoolFunded(token, msg.sender, amount);
    }

    // ── Owner: treasury ───────────────────────────────────────────────────────

    /// @notice Withdraw accumulated rake for `token` to `to`.
    function withdrawFree(address token, uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount > freeTreasury[token]) revert AmountExceedsFree(amount, freeTreasury[token]);
        freeTreasury[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit FreeWithdrawn(token, amount, to);
    }

    /**
     * @notice Emergency drain — sweeps freeTreasury plus unallocated pool funds to `to`.
     *         Only callable when paused. Does NOT touch lockedForSessions so that players
     *         can still call cancelExpired() to reclaim their effectiveStake. If the contract
     *         is subsequently re-funded, outstanding cancellations will succeed.
     *
     *         To deprecate fully (no re-fund planned), disable the token with enableToken(token, false)
     *         after draining so no new sessions can start, and settle/cancel all open sessions
     *         individually before calling emergencyWithdraw.
     */
    function emergencyWithdraw(address token, address to) external onlyOwner whenPaused {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal     = IERC20(token).balanceOf(address(this));
        // Sweep everything except what is locked for open sessions.
        uint256 locked  = lockedForSessions[token];
        uint256 sweepable = bal > locked ? bal - locked : 0;
        freeTreasury[token] = 0;
        if (sweepable > 0) IERC20(token).safeTransfer(to, sweepable);
        emit EmergencyWithdraw(token, sweepable, to);
    }

    // ── Owner: config ─────────────────────────────────────────────────────────

    /**
     * @notice Whitelist or de-list a token. CELO's ERC-20 address is permanently rejected
     *         to avoid the token-duality solvency-check inflation risk.
     */
    function enableToken(address token, bool enabled) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (token == CELO_ERC20) revert CELONotAllowed();
        tokenEnabled[token] = enabled;
        emit TokenEnabled(token, enabled);
    }

    /**
     * @notice Set the per-token stake cap in the token's smallest unit.
     *         Must be called for each token before enabling it, because USDm (18 dec) and
     *         USDC/USDT (6 dec) need different values to represent the same dollar amount.
     */
    function setMaxStake(address token, uint256 maxStake_) external onlyOwner {
        maxStake[token] = maxStake_;
        emit MaxStakeSet(token, maxStake_);
    }

    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroAddress();
        emit SignerUpdated(trustedSigner, signer_);
        trustedSigner = signer_;
    }

    function setRakeBps(uint16 rakeBps_) external onlyOwner {
        if (rakeBps_ > MAX_RAKE_BPS) revert RakeTooHigh(rakeBps_, MAX_RAKE_BPS);
        rakeBps = rakeBps_;
    }
    function setMaxRoundsCap(uint8 cap)  external onlyOwner { maxRoundsCap = cap; }
    function setSessionTtl(uint64 ttl)   external onlyOwner { sessionTtl   = ttl; }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getSession(bytes32 sessionId) external view returns (Session memory) {
        return _sessions[sessionId];
    }

    /// @notice Available payout pool for `token` (funds not locked or in freeTreasury).
    function payoutPool(address token) external view returns (uint256) {
        uint256 bal    = IERC20(token).balanceOf(address(this));
        uint256 locked = freeTreasury[token] + lockedForSessions[token];
        return bal > locked ? bal - locked : 0;
    }

    /// @notice Maximum achievable multiplier (bps) for a session with `rounds` rounds.
    function maxMultiplierBp(uint8 rounds) external pure returns (uint256) {
        return BPS + STEP_BPS * uint256(rounds);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _cancel(bytes32 sessionId) internal {
        Session storage s = _sessions[sessionId];
        if (s.player == address(0)) revert UnknownSession();
        if (s.settled)              revert AlreadySettled();
        if (block.timestamp < s.expiry) revert NotExpired();
        _cancelSession(sessionId, s);
    }

    function _cancelSession(bytes32 sessionId, Session storage s) internal {
        uint256 refund = s.effectiveStake;
        s.settled = true;
        lockedForSessions[s.token] -= s.reserve;
        IERC20(s.token).safeTransfer(s.player, refund);
        emit SessionCancelled(sessionId, s.player, s.token, refund);
    }
}
