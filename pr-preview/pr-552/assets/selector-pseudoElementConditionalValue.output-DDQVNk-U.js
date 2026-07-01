import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-CUwR1emN.js";var r=e(),i=n.div`
  position: relative;
  padding: 12px 16px 12px 28px;
  background-color: #f8fafc;

  &::before {
    content: "";
    position: absolute;
    left: 8px;
    top: 50%;
    width: 8px;
    height: 8px;
    transform: translateY(-50%);
    background-color: #94a3b8;

    ${e=>e.$expanded&&t`
        background-color: #16a34a;

        &:hover {
          background-color: #15803d;
        }
      `}
  }
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,r.jsx)(i,{children:`Collapsed`}),(0,r.jsx)(i,{$expanded:!0,children:`Expanded`})]});export{a as App};