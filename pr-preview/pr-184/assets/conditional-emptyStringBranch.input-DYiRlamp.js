import{j as i,a as o}from"./index-SYvytoAN.js";const d=o.div`
  display: flex;
  background-color: #e0e0e0;
  margin-bottom: 8px;
  ${n=>n.$disableMinWidth?"":"min-width: 500px;"}
`,r=o.div`
  display: flex;
  background-color: #d0d0f0;
  margin-bottom: 8px;
  ${n=>n.$enableMinWidth?"min-width: 500px;":""}
`,t=o.div`
  padding: 16px;
  background-color: #f0e0d0;
  margin-bottom: 8px;
  ${n=>n.$compact?"":`
      margin: 24px;
      border: 1px solid gray;
    `}
`,e=()=>i.jsxs("div",{children:[i.jsx(d,{children:"Normal (has min-width)"}),i.jsx(d,{$disableMinWidth:!0,children:"Disabled min-width"}),i.jsx(r,{children:"No min-width"}),i.jsx(r,{$enableMinWidth:!0,children:"Has min-width"}),i.jsx(t,{children:"Normal container with margin/border"}),i.jsx(t,{$compact:!0,children:"Compact container without margin/border"})]});export{e as App};
