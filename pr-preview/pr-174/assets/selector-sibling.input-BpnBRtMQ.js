import{j as i,a as l}from"./index-BduwzvOj.js";const e=l.div`
  color: blue;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }

  /* General sibling: all following siblings */
  &.something ~ & {
    background: yellow;
  }
`,o=()=>i.jsxs("div",{children:[i.jsx(e,{children:"First (blue)"}),i.jsx(e,{children:"Second (red, lime background - adjacent to first)"}),i.jsx(e,{className:"something",children:"Third with .something class"}),i.jsx(e,{children:"Fourth (yellow background - sibling after .something)"}),i.jsx(e,{children:"Fifth (yellow background - sibling after .something)"})]});export{o as App};
