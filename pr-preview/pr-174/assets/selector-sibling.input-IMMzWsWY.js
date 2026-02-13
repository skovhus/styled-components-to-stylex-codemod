import{j as i,a as l}from"./index-C9XqlRtz.js";const s=l.div`
  color: blue;

  /* General sibling: all following siblings */
  &.something ~ & {
    background: yellow;
  }
`,n=()=>i.jsxs("div",{children:[i.jsx(s,{children:"First (blue)"}),i.jsx(s,{children:"Second (blue)"}),i.jsx(s,{className:"something",children:"Third with .something class"}),i.jsx(s,{children:"Fourth (yellow background - sibling after .something)"}),i.jsx(s,{children:"Fifth (yellow background - sibling after .something)"})]});export{n as App};
