import{j as e,c as l}from"./index-DkGxyC9P.js";const r=l.span`
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
    background-color: ${o=>o.$badgeColor};
  }
`,t=l.div`
  position: relative;
  padding: 8px;

  &::before {
    content: "";
    display: block;
    height: 3px;
    background-color: ${o=>o.$tipColor||"black"};
  }
`,c=l.span`
  position: relative;
  padding: 4px 8px;
  background-color: #e0e0e0;

  &::after {
    content: "";
    display: block;
    height: 2px;
    background-color: ${o=>o.$tagColor};
  }
`,d=l.button`
  position: relative;
  padding: 8px 16px;
  background-color: #333;
  color: white;

  &::after {
    content: "";
    display: block;
    height: 3px;
    opacity: 0;
  }

  &:hover::after {
    opacity: 1;
    background-color: ${o=>o.$glowColor};
  }
`,i=l.input`
  padding: 12px;
  border: 1px solid #ccc;
  background: white;

  &::placeholder {
    color: ${o=>o.theme.color.labelMuted};
  }
`,a=l.input`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${o=>o.theme.color[o.$placeholderColor]};
  }
`,n=()=>e.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px",width:560,flexWrap:"wrap"},children:[e.jsx(r,{$badgeColor:"red",children:"Notification"}),e.jsx(r,{$badgeColor:"green",children:"Online"}),e.jsx(r,{$badgeColor:"blue",children:"Info"}),e.jsx(t,{$tipColor:"navy",children:"With color"}),e.jsx(t,{children:"Default"}),e.jsx(c,{$tagColor:"tomato",children:"With color"}),e.jsx(c,{children:"No color"}),e.jsx(d,{$glowColor:"rgba(0,128,255,0.3)",children:"Hover me"}),e.jsx(i,{placeholder:"Muted placeholder"}),e.jsx(a,{$placeholderColor:"labelBase",placeholder:"Base"}),e.jsx(a,{$placeholderColor:"labelMuted",placeholder:"Muted"})]});export{n as App};
