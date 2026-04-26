import"./chunk-jRWAZmH_.js";import{c as e,f as t,p as n,u as r}from"./index-DimFOxuE.js";n();var i=t(),a=r.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background-color: white;
  ${({$active:t,$completed:n})=>(t||n)&&e`
      border-color: #6366f1;
      background-color: #6366f1;
    `}
`,o=r.div`
  padding: 8px 16px;
  background-color: #6366f1;
  color: white;
  ${({$active:t,$completed:n})=>!(t||n)&&e`
      background-color: #e2e8f0;
      color: #64748b;
    `}
`,s=r.span`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #e2e8f0;
  ${({$visible:t,$primary:n,$accent:r})=>t&&(n||r)&&e`
      background-color: #6366f1;
      color: white;
    `}
`;function c(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:20,alignItems:`center`,flexWrap:`wrap`},children:[(0,i.jsx)(a,{children:`neither`}),(0,i.jsx)(a,{$active:!0,children:`active`}),(0,i.jsx)(a,{$completed:!0,children:`completed`}),(0,i.jsx)(a,{$active:!0,$completed:!0,children:`both`}),(0,i.jsx)(o,{children:`neither`}),(0,i.jsx)(o,{$active:!0,children:`active`}),(0,i.jsx)(o,{$completed:!0,children:`completed`}),(0,i.jsx)(s,{children:`hidden`}),(0,i.jsx)(s,{$visible:!0,children:`visible`}),(0,i.jsx)(s,{$visible:!0,$primary:!0,children:`primary`}),(0,i.jsx)(s,{$visible:!0,$accent:!0,children:`accent`})]})}export{c as App};