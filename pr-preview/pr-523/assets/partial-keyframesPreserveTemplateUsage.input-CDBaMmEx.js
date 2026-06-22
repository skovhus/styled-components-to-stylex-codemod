import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{c as t,u as n}from"./index-BO-NS-aI.js";var r=e(),i=t`
  from {
    background-position: 0 50%;
  }

  to {
    background-position: 100% 50%;
  }
`,a=n.div`
  padding: 12px;
  color: #1d4ed8;
`,o=n.span`
  animation: ${i} 1.2s linear infinite;
  background: linear-gradient(90deg, #60a5fa, #f472b6);
  background-size: 200% 100%;

  & a.active {
    color: tomato;
  }
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,r.jsx)(a,{children:`Converted text`}),(0,r.jsx)(o,{children:(0,r.jsx)(`a`,{className:`active`,href:`#`,children:`Preserved animated text`})})]});export{s as App};