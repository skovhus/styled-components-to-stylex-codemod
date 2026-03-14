import{j as o,c as e}from"./index-BikbNCxu.js";const r=e.span`
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
`,i=e.div`
  position: relative;
  padding: 8px;

  &::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    background-color: ${t=>t.$tipColor||"black"};
  }
`,n=e.button`
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
`,a=()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px",width:560},children:[o.jsx(r,{$badgeColor:"red",children:"Notification"}),o.jsx(r,{$badgeColor:"green",children:"Online"}),o.jsx(r,{$badgeColor:"blue",children:"Info"}),o.jsx(i,{$tipColor:"navy",children:"With color"}),o.jsx(i,{children:"Default"}),o.jsx(n,{$glowColor:"rgba(0,128,255,0.3)",children:"Hover me"})]});export{a as App};
