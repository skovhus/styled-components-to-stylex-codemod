import{j as o,c as r}from"./index-BQQmmYAy.js";const e=r.span`
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
    background-color: ${t=>t.$badgeColor};
  }
`,i=r.div`
  position: relative;
  padding: 8px;

  &::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    background-color: ${t=>t.$tipColor||"black"};
  }
`,n=r.span`
  position: relative;
  padding: 4px 8px;
  background-color: #e0e0e0;

  &::after {
    content: "";
    display: block;
    height: 2px;
    background-color: ${t=>t.$tagColor};
  }
`,l=r.button`
  padding: 8px 16px;
  background-color: #333;
  color: white;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0;
  }

  &:hover::after {
    opacity: 1;
    background-color: ${t=>t.$glowColor};
  }
`,c=()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px",width:560},children:[o.jsx(e,{$badgeColor:"red",children:"Notification"}),o.jsx(e,{$badgeColor:"green",children:"Online"}),o.jsx(e,{$badgeColor:"blue",children:"Info"}),o.jsx(i,{$tipColor:"navy",children:"With color"}),o.jsx(i,{children:"Default"}),o.jsx(n,{$tagColor:"tomato",children:"With color"}),o.jsx(n,{children:"No color"}),o.jsx(l,{$glowColor:"rgba(0,128,255,0.3)",children:"Hover me"})]});export{c as App};
