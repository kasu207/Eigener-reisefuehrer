/**
 * Flat-Design-Illustrationen (2D) im Stil moderner Reisemagazine.
 * Eigene SVG-Grafiken – keine Lizenz-/Quellenangabe nötig (im Gegensatz zu
 * Fotos, die immer mit Urheber, Lizenz und Quelllink gerendert werden).
 */

/** Große Hero-Szene: See, Berge, Dorf, Segelboot, Zypressen. */
export function LakeHero({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 340"
      role="img"
      aria-label="Flat-Design-Illustration: See mit Bergen, Dorf und Segelboot"
      className={className}
    >
      <rect width="800" height="340" fill="#f6ead8" />
      {/* Sonne */}
      <circle cx="640" cy="70" r="38" fill="#e8b04b" />
      <circle cx="640" cy="70" r="52" fill="#e8b04b" opacity="0.25" />
      {/* Bergketten */}
      <path d="M0 190 L120 80 L210 165 L300 60 L420 190 Z" fill="#7d92a1" />
      <path d="M260 190 L390 95 L500 190 Z" fill="#93a7b3" />
      <path d="M430 190 L560 70 L700 190 Z" fill="#6b8290" />
      <path d="M600 190 L710 110 L800 190 Z" fill="#879ca9" />
      {/* Schneekappen */}
      <path d="M300 60 L322 88 L308 84 L296 96 L284 82 Z" fill="#f7f4ee" />
      <path d="M560 70 L582 98 L568 94 L556 106 L544 92 Z" fill="#f7f4ee" />
      {/* See */}
      <rect y="190" width="800" height="150" fill="#33566b" />
      <rect y="190" width="800" height="150" fill="url(#none)" />
      <path d="M0 190 h800 v12 H0 Z" fill="#4a6d82" opacity="0.7" />
      {/* Wellen */}
      <g stroke="#5d8095" strokeWidth="4" strokeLinecap="round" opacity="0.6">
        <path d="M60 250 h56" />
        <path d="M180 285 h44" />
        <path d="M330 260 h60" />
        <path d="M540 290 h50" />
        <path d="M660 250 h44" />
      </g>
      {/* Dorf am Ufer */}
      <g>
        <rect x="60" y="146" width="34" height="44" fill="#d9a05b" />
        <path d="M60 146 L77 130 L94 146 Z" fill="#a4632e" />
        <rect x="100" y="156" width="30" height="34" fill="#e7c186" />
        <path d="M100 156 L115 142 L130 156 Z" fill="#a4632e" />
        <rect x="136" y="150" width="26" height="40" fill="#d9a05b" />
        <path d="M136 150 L149 136 L162 150 Z" fill="#8a5226" />
        {/* Kirchturm */}
        <rect x="170" y="122" width="16" height="68" fill="#e7c186" />
        <path d="M170 122 L178 104 L186 122 Z" fill="#a4632e" />
        {/* Fenster */}
        <g fill="#5c4326" opacity="0.55">
          <rect x="70" y="156" width="7" height="10" />
          <rect x="82" y="156" width="7" height="10" />
          <rect x="108" y="164" width="6" height="9" />
          <rect x="144" y="158" width="6" height="9" />
          <rect x="174" y="132" width="8" height="10" />
        </g>
      </g>
      {/* Zypressen */}
      <g fill="#4a7c3f">
        <path d="M226 190 C220 168 220 150 226 132 C232 150 232 168 226 190 Z" />
        <path d="M244 190 C239 172 239 158 244 142 C249 158 249 172 244 190 Z" />
        <path d="M770 190 C764 166 764 146 770 126 C776 146 776 166 770 190 Z" />
      </g>
      {/* Segelboot */}
      <g>
        <path d="M470 268 L530 268 L516 284 L484 284 Z" fill="#a4632e" />
        <path d="M500 200 L500 264 L468 264 Z" fill="#f7f4ee" />
        <path d="M506 214 L506 264 L540 264 Z" fill="#e8b04b" />
        <rect x="499" y="196" width="4" height="72" fill="#5c4326" />
      </g>
      {/* Möwen */}
      <g stroke="#5c4326" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M330 100 q8 -8 16 0 q8 -8 16 0" />
        <path d="M390 128 q6 -6 12 0 q6 -6 12 0" />
      </g>
    </svg>
  );
}

/** Kleine flache Kapitel-Icons. */
export function ChapterIcon({
  kind,
  className = "h-10 w-10",
}: {
  kind: "places" | "hikes" | "restaurants" | "practical" | "info" | "register" | "days" | "map";
  className?: string;
}) {
  const common = { viewBox: "0 0 48 48", className, "aria-hidden": true } as const;
  switch (kind) {
    case "places": // Dorf
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#e9d9c8" />
          <rect x="12" y="24" width="10" height="12" fill="#d9a05b" />
          <path d="M12 24 L17 18 L22 24 Z" fill="#a4632e" />
          <rect x="26" y="20" width="8" height="16" fill="#e7c186" />
          <path d="M26 20 L30 14 L34 20 Z" fill="#a4632e" />
          <rect x="15" y="28" width="4" height="5" fill="#5c4326" opacity="0.6" />
          <rect x="28" y="24" width="4" height="5" fill="#5c4326" opacity="0.6" />
        </svg>
      );
    case "hikes": // Berge mit Fähnchen
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#dbe7d3" />
          <path d="M8 34 L20 16 L28 28 L34 20 L42 34 Z" fill="#4a7c3f" />
          <path d="M20 16 L23 21 L20 20 L17 21 Z" fill="#f7f4ee" />
          <rect x="33" y="10" width="2" height="10" fill="#5c4326" />
          <path d="M35 10 L42 13 L35 16 Z" fill="#a4632e" />
        </svg>
      );
    case "restaurants": // Teller mit Besteck
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#f3d9c4" />
          <circle cx="24" cy="24" r="11" fill="#faf7f2" />
          <circle cx="24" cy="24" r="6" fill="#a4632e" />
          <rect x="8" y="14" width="2.5" height="20" rx="1" fill="#5c4326" />
          <rect x="37" y="14" width="2.5" height="20" rx="1" fill="#5c4326" />
          <path d="M12.5 14 v6 M15 14 v6" stroke="#5c4326" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "practical": // Fähre
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#cfdde6" />
          <path d="M10 30 h28 l-5 7 H15 Z" fill="#33566b" />
          <rect x="16" y="22" width="16" height="8" fill="#faf7f2" />
          <rect x="19" y="24" width="4" height="4" fill="#33566b" />
          <rect x="25" y="24" width="4" height="4" fill="#33566b" />
          <rect x="22" y="15" width="3" height="7" fill="#a4632e" />
        </svg>
      );
    case "info": // Buch
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#e9d9c8" />
          <path d="M24 14 C20 11 14 11 11 13 v20 c3 -2 9 -2 13 1 Z" fill="#faf7f2" />
          <path d="M24 14 C28 11 34 11 37 13 v20 c-3 -2 -9 -2 -13 1 Z" fill="#e7c186" />
          <path d="M24 14 v21" stroke="#a4632e" strokeWidth="2" />
        </svg>
      );
    case "register": // Lesezeichen
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#dfd4e4" />
          <path d="M17 11 h14 v26 l-7 -6 -7 6 Z" fill="#a4632e" />
          <path d="M17 11 h14 v5 H17 Z" fill="#8a5226" />
        </svg>
      );
    case "days": // Sonne
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#f6ead8" />
          <circle cx="24" cy="24" r="8" fill="#e8b04b" />
          <g stroke="#e8b04b" strokeWidth="3" strokeLinecap="round">
            <path d="M24 8 v5 M24 35 v5 M8 24 h5 M35 24 h5 M13 13 l3.5 3.5 M31.5 31.5 L35 35 M35 13 l-3.5 3.5 M16.5 31.5 L13 35" />
          </g>
        </svg>
      );
    case "map": // Kompass
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="24" fill="#cfdde6" />
          <circle cx="24" cy="24" r="13" fill="#faf7f2" />
          <path d="M24 13 L27 24 L24 35 L21 24 Z" fill="#a4632e" />
          <path d="M24 13 L27 24 L21 24 Z" fill="#c9803f" />
        </svg>
      );
  }
}
