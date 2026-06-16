import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n}from"./index-CavQU4dy.js";var r=e(),i=n.ul`
  position: relative;
  min-height: 72px;
  padding: 16px;
  background: #f8fafc;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.2));
    pointer-events: none;
  }

  ${e=>e.$hideOverlay?t`
          &::after {
            display: none;
          }
        `:``}
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,r.jsx)(i,{children:(0,r.jsx)(`li`,{children:`Overlay visible`})}),(0,r.jsx)(i,{$hideOverlay:!0,children:(0,r.jsx)(`li`,{children:`Overlay hidden`})})]});export{a as App};