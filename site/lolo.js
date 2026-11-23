/* Lolo the axolotl. Returns the inner markup of a 220 x 190 SVG so he can live in plain
   HTML or inside a scene. Poses are CSS classes on the outer <svg class="ax ...">:
     ax-wave   left arm waves              ax-tilt  head tilts, glasses slip and pop back
     ax-happy  bouncy body                 ax-joy   happy ^ ^ eyes
     ax-puff   puffed cheeks, little o mouth (thinking hard)
     ax-tada   both arms up, wiggling
   Chibi proportions: big wide head, small round body, glossy eyes set low, oversized crooked
   glasses, a hibiscus tucked behind one gill, paddle gills, and a finned tail. */
let n = 0;
export function axBody() {
  const id = "axg" + (++n);
  const line = 'stroke="rgba(52,128,168,0.75)" stroke-width="2.6" stroke-linejoin="round"';
  const skin = `fill="url(#${id}b)" ${line}`;
  const dark = "#20384A";
  // A gill is a short rounded paddle, fat at the tip, with soft fringe lines. The rotation lives
  // on an inner group so the CSS sway on .ax-gill still works.
  const gill = (cls, bx, by, deg, k = 1) => `<g class="ax-gill ${cls}"><g transform="translate(${bx} ${by}) rotate(${deg}) scale(${k})">
      <path d="M0 -4 C9 -6 15 -12 23 -12 C33 -12 36 -4 36 0 C36 4 33 12 23 12 C15 12 9 6 0 4 Z" fill="url(#${id}g)" stroke="rgba(52,128,168,0.7)" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M14 -2 L30 -7 M16 0 L33 0 M14 2 L30 7" stroke="rgba(255,255,255,0.65)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="27" cy="-6" r="2.2" fill="#fff" opacity="0.8"/></g></g>`;
  return `
  <defs>
    <filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#86E3FF" flood-opacity="0.75"/>
    </filter>
    <radialGradient id="${id}b" gradientUnits="userSpaceOnUse" cx="92" cy="52" r="150">
      <stop offset="0" stop-color="rgba(240,252,255,0.97)"/>
      <stop offset="0.55" stop-color="rgba(178,236,255,0.93)"/>
      <stop offset="1" stop-color="rgba(140,214,246,0.93)"/>
    </radialGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8FDDFB"/><stop offset="1" stop-color="#C3B4FF"/>
    </linearGradient>
    <linearGradient id="${id}f" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(170,225,255,0.55)"/><stop offset="1" stop-color="rgba(200,185,255,0.8)"/>
    </linearGradient>
  </defs>
  <g class="ax-all" filter="url(#${id})">
    <g class="ax-tail">
      <path d="M138 140 C160 145 182 140 203 124 Q211 119 209 128 C204 142 192 150 176 155" fill="none" stroke="rgba(120,110,210,0.35)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M138 140 C160 145 182 140 203 124 Q211 119 209 128 C204 142 192 150 176 155" fill="none" stroke="rgba(200,185,255,0.95)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M122 134 C150 144 180 142 203 124 Q211 119 209 128 C198 149 168 164 126 162 Z" ${skin}/>
      <path d="M146 154 C168 154 186 144 200 132" stroke="rgba(255,255,255,0.7)" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    </g>
    <ellipse cx="108" cy="142" rx="35" ry="28" ${skin}/>
    <ellipse cx="108" cy="148" rx="20" ry="15" fill="rgba(245,253,255,0.9)"/>
    <ellipse cx="92" cy="168" rx="10" ry="6.5" ${skin}/><ellipse cx="124" cy="168" rx="10" ry="6.5" ${skin}/>
    <g class="ax-arm-l"><ellipse cx="76" cy="150" rx="8" ry="12.5" transform="rotate(28 76 150)" ${skin}/></g>
    <g class="ax-arm-r"><ellipse cx="140" cy="150" rx="8" ry="12.5" transform="rotate(-28 140 150)" ${skin}/></g>
    <g class="ax-head">
      ${gill("l1", 70, 52, -128, 0.95)}
      ${gill("l2", 56, 74, -172, 1.05)}
      ${gill("l3", 60, 98, 150, 0.95)}
      ${gill("r1", 150, 52, -52, 0.95)}
      ${gill("r2", 164, 74, -8, 1.05)}
      ${gill("r3", 160, 98, 30, 0.95)}
      <g class="ax-puffs"><circle cx="56" cy="108" r="17" ${skin}/><circle cx="164" cy="108" r="17" ${skin}/></g>
      <ellipse cx="110" cy="80" rx="62" ry="47" fill="url(#${id}b)"/>
      <ellipse cx="110" cy="80" rx="62" ry="47" fill="none" ${line}/>
      <g class="ax-puffs"><circle cx="56" cy="108" r="15.7" fill="url(#${id}b)"/><circle cx="164" cy="108" r="15.7" fill="url(#${id}b)"/></g>
      <circle cx="98" cy="44" r="2.4" fill="rgba(110,190,230,0.7)"/><circle cx="110" cy="40" r="2.8" fill="rgba(110,190,230,0.7)"/><circle cx="122" cy="44" r="2.4" fill="rgba(110,190,230,0.7)"/>
      <g class="ax-flower" transform="translate(146 38)">
        <g class="ax-flower-spin">
          ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-8" rx="6.5" ry="9" transform="rotate(${a})" fill="#FF8FA8" stroke="#E8607E" stroke-width="1.6"/>`).join("")}
          <circle r="4" fill="#FFD166" stroke="#E8A935" stroke-width="1.2"/>
          <path d="M0 0 L6 -11" stroke="#E8A935" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="-12" r="1.8" fill="#FFD166"/>
        </g>
      </g>
      <g class="ax-eyes">
        <ellipse cx="84" cy="90" rx="11.5" ry="12.5" fill="${dark}"/><ellipse cx="136" cy="90" rx="11.5" ry="12.5" fill="${dark}"/>
        <circle cx="80" cy="85" r="4.6" fill="#fff"/><circle cx="132" cy="85" r="4.6" fill="#fff"/>
        <circle cx="88.5" cy="95" r="2" fill="#fff" opacity="0.9"/><circle cx="140.5" cy="95" r="2" fill="#fff" opacity="0.9"/>
        <g class="ax-lids"><ellipse cx="84" cy="90" rx="13" ry="14" fill="#B8EBFF"/><ellipse cx="136" cy="90" rx="13" ry="14" fill="#B8EBFF"/></g>
      </g>
      <g class="ax-squint" stroke="${dark}" stroke-width="3.6" stroke-linecap="round" fill="none">
        <path d="M74 94 Q84 80 94 94"/><path d="M126 94 Q136 80 146 94"/>
      </g>
      <g class="ax-mouth">
        <path d="M104.5 104 Q110 105.5 115.5 104 Q115 111.5 110 111.5 Q105 111.5 104.5 104 Z" fill="${dark}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
        <ellipse cx="110" cy="109.4" rx="3" ry="1.7" fill="#FF8FA8"/>
      </g>
      <ellipse class="ax-mouth-o" cx="110" cy="107" rx="3.4" ry="4" fill="${dark}"/>
      <g class="ax-glasses"><g transform="rotate(-4 110 90)">
        <circle cx="84" cy="90" r="21" fill="rgba(255,255,255,0.14)" stroke="#FF7E67" stroke-width="4.5"/>
        <circle cx="137" cy="90" r="22.5" fill="rgba(255,255,255,0.14)" stroke="#FF7E67" stroke-width="4.5"/>
        <path d="M104 86 Q110.5 80 116 86" stroke="#FF7E67" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <path d="M64 86 L54 80" stroke="#FF7E67" stroke-width="4.5" stroke-linecap="round"/><path d="M158.5 86 L168 80" stroke="#FF7E67" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M93 76 Q98 80 99 86" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M147 75 Q152 79 153 86" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round" fill="none"/>
      </g></g>
      <g class="ax-cheeks"><ellipse cx="62" cy="113" rx="9.5" ry="5.5" fill="rgba(255,138,170,0.55)"/><ellipse cx="158" cy="113" rx="9.5" ry="5.5" fill="rgba(255,138,170,0.55)"/></g>
    </g>
  </g>`;
}
