import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-aU_nvjcx.js";n();var i=e(),a=r.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background-color: white;
  ${({$active:e,$completed:n})=>(e||n)&&t`
      border-color: #6366f1;
      background-color: #6366f1;
    `}
`,o=r.div`
  padding: 8px 16px;
  background-color: #6366f1;
  color: white;
  ${({$active:e,$completed:n})=>!(e||n)&&t`
      background-color: #e2e8f0;
      color: #64748b;
    `}
`,s=r.span`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #e2e8f0;
  ${({$visible:e,$primary:n,$accent:r})=>e&&(n||r)&&t`
      background-color: #6366f1;
      color: white;
    `}
`;function c(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:20,alignItems:`center`,flexWrap:`wrap`},children:[(0,i.jsx)(a,{children:`neither`}),(0,i.jsx)(a,{$active:!0,children:`active`}),(0,i.jsx)(a,{$completed:!0,children:`completed`}),(0,i.jsx)(a,{$active:!0,$completed:!0,children:`both`}),(0,i.jsx)(o,{children:`neither`}),(0,i.jsx)(o,{$active:!0,children:`active`}),(0,i.jsx)(o,{$completed:!0,children:`completed`}),(0,i.jsx)(s,{children:`hidden`}),(0,i.jsx)(s,{$visible:!0,children:`visible`}),(0,i.jsx)(s,{$visible:!0,$primary:!0,children:`primary`}),(0,i.jsx)(s,{$visible:!0,$accent:!0,children:`accent`})]})}export{c as App};