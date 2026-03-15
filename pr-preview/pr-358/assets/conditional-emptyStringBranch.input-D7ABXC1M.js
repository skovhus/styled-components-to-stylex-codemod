import"./react-D4cBbUL-.js";import{f as e,s as t,u as n}from"./index-GfnpIRuu.js";var r=e(),i=t.div`
  display: flex;
  background-color: #e0e0e0;
  margin-bottom: 8px;
  ${e=>e.$disableMinWidth?``:`min-width: 500px;`}
`,a=t.div`
  display: flex;
  background-color: #d0d0f0;
  margin-bottom: 8px;
  ${e=>e.$enableMinWidth?`min-width: 500px;`:``}
`,o=t.div`
  padding: 16px;
  background-color: #f0e0d0;
  margin-bottom: 8px;
  ${e=>e.$compact?``:`
      margin: 24px;
      border: 1px solid gray;
    `}
`,s=t.div`
  background-color: #e0f0e0;
  margin-bottom: 8px;
  ${e=>e.$fullWidth?``:n`
          max-width: 400px;
          padding: 0 16px;
        `}
`,c=t.div`
  background-color: #f0e0f0;
  margin-bottom: 8px;
  ${e=>e.$narrow?n`
          max-width: 400px;
          padding: 0 16px;
        `:``}
`,l=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{children:`Normal (has min-width)`}),(0,r.jsx)(i,{$disableMinWidth:!0,children:`Disabled min-width`}),(0,r.jsx)(a,{children:`No min-width`}),(0,r.jsx)(a,{$enableMinWidth:!0,children:`Has min-width`}),(0,r.jsx)(o,{children:`Normal container with margin/border`}),(0,r.jsx)(o,{$compact:!0,children:`Compact container without margin/border`}),(0,r.jsx)(s,{children:`Wrapper (has max-width/padding)`}),(0,r.jsx)(s,{$fullWidth:!0,children:`Wrapper full width`}),(0,r.jsx)(c,{children:`WrapperAlt (no max-width)`}),(0,r.jsx)(c,{$narrow:!0,children:`WrapperAlt narrow`})]});export{l as App};