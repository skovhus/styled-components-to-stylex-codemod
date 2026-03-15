import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CyUUxAP6.js";var n=e(),r={small:20,medium:24,large:32};function i(e){let t=r[e];return`width: ${t}px; height: ${t}px;`}var a=t.div`
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  line-height: 0;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  ${e=>e.disabled?`opacity: 0.5;`:``};
  ${e=>i(e.size)}
`,o=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:`8px`,alignItems:`center`},children:[(0,n.jsx)(a,{size:`small`,children:(0,n.jsx)(`div`,{style:{background:`#bf4f74`,width:`100%`,height:`100%`,display:`flex`,alignItems:`center`,justifyContent:`center`,color:`white`,fontSize:`10px`},children:`S`})}),(0,n.jsx)(a,{size:`medium`,children:(0,n.jsx)(`div`,{style:{background:`#4f74bf`,width:`100%`,height:`100%`,display:`flex`,alignItems:`center`,justifyContent:`center`,color:`white`,fontSize:`10px`},children:`M`})}),(0,n.jsx)(a,{size:`large`,children:(0,n.jsx)(`div`,{style:{background:`#22c55e`,width:`100%`,height:`100%`,display:`flex`,alignItems:`center`,justifyContent:`center`,color:`white`,fontSize:`10px`},children:`L`})}),(0,n.jsx)(a,{size:`medium`,disabled:!0,children:(0,n.jsx)(`div`,{style:{background:`#666`,width:`100%`,height:`100%`,display:`flex`,alignItems:`center`,justifyContent:`center`,color:`white`,fontSize:`10px`},children:`Md`})})]});export{o as App};