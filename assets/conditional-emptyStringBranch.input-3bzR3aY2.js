import{j as i,a as d,b as p}from"./index-CeQ9WA9b.js";const n=d.div`
  display: flex;
  background-color: #e0e0e0;
  margin-bottom: 8px;
  ${r=>r.$disableMinWidth?"":"min-width: 500px;"}
`,t=d.div`
  display: flex;
  background-color: #d0d0f0;
  margin-bottom: 8px;
  ${r=>r.$enableMinWidth?"min-width: 500px;":""}
`,o=d.div`
  padding: 16px;
  background-color: #f0e0d0;
  margin-bottom: 8px;
  ${r=>r.$compact?"":`
      margin: 24px;
      border: 1px solid gray;
    `}
`,a=d.div`
  background-color: #e0f0e0;
  margin-bottom: 8px;
  ${r=>r.$fullWidth?"":p`
          max-width: 400px;
          padding: 0 16px;
        `}
`,e=d.div`
  background-color: #f0e0f0;
  margin-bottom: 8px;
  ${r=>r.$narrow?p`
          max-width: 400px;
          padding: 0 16px;
        `:""}
`,x=()=>i.jsxs("div",{children:[i.jsx(n,{children:"Normal (has min-width)"}),i.jsx(n,{$disableMinWidth:!0,children:"Disabled min-width"}),i.jsx(t,{children:"No min-width"}),i.jsx(t,{$enableMinWidth:!0,children:"Has min-width"}),i.jsx(o,{children:"Normal container with margin/border"}),i.jsx(o,{$compact:!0,children:"Compact container without margin/border"}),i.jsx(a,{children:"Wrapper (has max-width/padding)"}),i.jsx(a,{$fullWidth:!0,children:"Wrapper full width"}),i.jsx(e,{children:"WrapperAlt (no max-width)"}),i.jsx(e,{$narrow:!0,children:"WrapperAlt narrow"})]});export{x as App};
