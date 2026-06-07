"use client";

export function SocialLinks() {
  const socials = [
    {
      name: "Discord",
      icon: "💬",
      url: "https://discord.gg/arcadia",
      color: "#5865F2",
    },
    {
      name: "Twitter",
      icon: "🐦",
      url: "https://twitter.com/arcadia_games",
      color: "#1DA1F2",
    },
    {
      name: "Telegram",
      icon: "✈️",
      url: "https://t.me/arcadia_games",
      color: "#0088cc",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      {socials.map((social) => (
        <a
          key={social.name}
          href={social.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{
            background: social.color,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 20px",
            fontSize: "16px",
          }}
        >
          <span style={{ fontSize: "20px" }}>{social.icon}</span>
          {social.name}
        </a>
      ))}
    </div>
  );
}
