import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-i2b-6PdY.js";var n=e(),r=t.button`
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
    background-color: ${e=>e.$glowColor};
  }
`,i=()=>(0,n.jsx)(r,{$glowColor:`rgba(0,128,255,0.3)`,children:`Hover me`});export{i as App};