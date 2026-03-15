import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r,u as i}from"./index-GfnpIRuu.js";e(t(),1);var a=n(),o=r.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background-color: white;
  ${({$active:e,$completed:t})=>(e||t)&&i`
      border-color: #6366f1;
      background-color: #6366f1;
    `}
`,s=r.div`
  padding: 8px 16px;
  background-color: #6366f1;
  color: white;
  ${({$active:e,$completed:t})=>!(e||t)&&i`
      background-color: #e2e8f0;
      color: #64748b;
    `}
`,c=r.span`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #e2e8f0;
  ${({$visible:e,$primary:t,$accent:n})=>e&&(t||n)&&i`
      background-color: #6366f1;
      color: white;
    `}
`;function l(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:20,alignItems:`center`,flexWrap:`wrap`},children:[(0,a.jsx)(o,{children:`neither`}),(0,a.jsx)(o,{$active:!0,children:`active`}),(0,a.jsx)(o,{$completed:!0,children:`completed`}),(0,a.jsx)(o,{$active:!0,$completed:!0,children:`both`}),(0,a.jsx)(s,{children:`neither`}),(0,a.jsx)(s,{$active:!0,children:`active`}),(0,a.jsx)(s,{$completed:!0,children:`completed`}),(0,a.jsx)(c,{children:`hidden`}),(0,a.jsx)(c,{$visible:!0,children:`visible`}),(0,a.jsx)(c,{$visible:!0,$primary:!0,children:`primary`}),(0,a.jsx)(c,{$visible:!0,$accent:!0,children:`accent`})]})}export{l as App};