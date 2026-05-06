import{c as e,p as t}from"./index-DOtSvtsV.js";var n=t(),r=e.span`
  color: blue;
  font-size: 20px;
`,i=e.button`
  padding: 8px 16px;
  background: lightgray;

  &:has(${r}) {
    padding-right: 32px;
    background: lightyellow;
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,n.jsx)(i,{children:`No icon`}),(0,n.jsxs)(i,{children:[`With icon `,(0,n.jsx)(r,{children:`★`})]})]});export{a as App};