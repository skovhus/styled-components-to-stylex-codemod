import{j as o,c as e}from"./index-RkKL71wp.js";const r=e.span`
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
`,l=e.div`
  position: relative;
  padding: 8px;

  &::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    background-color: ${t=>t.$tipColor||"black"};
  }
`,i=e.span`
  position: relative;
  padding: 4px 8px;
  background-color: #e0e0e0;

  &::after {
    content: "";
    display: block;
    height: 2px;
    background-color: ${t=>t.$tagColor};
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
`,a=e.input`
  padding: 12px;
  border: 1px solid #ccc;
  background: white;

  &::placeholder {
    color: ${t=>t.theme.color.labelMuted};
  }
`,d=()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px",width:560,flexWrap:"wrap"},children:[o.jsx(r,{$badgeColor:"red",children:"Notification"}),o.jsx(r,{$badgeColor:"green",children:"Online"}),o.jsx(r,{$badgeColor:"blue",children:"Info"}),o.jsx(l,{$tipColor:"navy",children:"With color"}),o.jsx(l,{children:"Default"}),o.jsx(i,{$tagColor:"tomato",children:"With color"}),o.jsx(i,{children:"No color"}),o.jsx(n,{$glowColor:"rgba(0,128,255,0.3)",children:"Hover me"}),o.jsx(a,{placeholder:"Muted placeholder"})]});export{d as App};
