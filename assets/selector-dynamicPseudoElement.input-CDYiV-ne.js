import{j as o,a as i}from"./index-CYapH9Fo.js";const e=i.span`
  position: relative;
  padding: 8px 16px;
  background-color: #f0f0f0;

  &::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    top: 0;
    right: 0;
    background-color: ${r=>r.$badgeColor};
  }
`,d=()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[o.jsx(e,{$badgeColor:"red",children:"Notification"}),o.jsx(e,{$badgeColor:"green",children:"Online"}),o.jsx(e,{$badgeColor:"blue",children:"Info"})]});export{d as App};
