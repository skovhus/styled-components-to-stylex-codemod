import{j as i,d as n}from"./index-DUEN-k9G.js";const o=n.div`
  display: flex;
  background-color: #e0e0e0;
  margin-bottom: 8px;
  ${d=>d.$disableMinWidth?"":"min-width: 500px;"}
`,r=n.div`
  display: flex;
  background-color: #d0d0f0;
  margin-bottom: 8px;
  ${d=>d.$enableMinWidth?"min-width: 500px;":""}
`,t=n.div`
  padding: 16px;
  background-color: #f0e0d0;
  margin-bottom: 8px;
  ${d=>d.$compact?"":`
      margin: 24px;
      border: 1px solid gray;
    `}
`,a=()=>i.jsxs("div",{children:[i.jsx(o,{children:"Normal (has min-width)"}),i.jsx(o,{$disableMinWidth:!0,children:"Disabled min-width"}),i.jsx(r,{children:"No min-width"}),i.jsx(r,{$enableMinWidth:!0,children:"Has min-width"}),i.jsx(t,{children:"Normal container with margin/border"}),i.jsx(t,{$compact:!0,children:"Compact container without margin/border"})]});export{a as App};
