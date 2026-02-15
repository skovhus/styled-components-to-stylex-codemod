import{j as s,b as o,a as r}from"./index-BXl6qirZ.js";const i=r.img`
  border-radius: 50%;
  width: 50px;
  height: 50px;

  ${t=>t.$disabled?o`
          filter: opacity(0.65);
        `:""}
  ${t=>t.$isInactive?o`
          box-shadow: 0 0 0 1px ${t.theme.color.bgSub};
          background-color: ${t.theme.color.bgSub};
          filter: opacity(0.5) grayscale(1);
        `:""};
`,c=()=>s.jsxs("div",{children:[s.jsx(i,{src:"https://picsum.photos/200",$disabled:!0}),s.jsx(i,{src:"https://picsum.photos/200"}),s.jsx("br",{}),s.jsx(i,{src:"https://picsum.photos/200",$disabled:!0,$isInactive:!0}),s.jsx(i,{src:"https://picsum.photos/200",$isInactive:!0})]});export{c as App};
