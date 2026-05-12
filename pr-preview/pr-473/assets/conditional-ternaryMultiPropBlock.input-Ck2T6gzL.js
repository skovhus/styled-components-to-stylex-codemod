import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-BBDa5HcU.js";n();var r=e(),i=e=>{let{column:t,color:n,gap:i,variant:a,...o}=e;return(0,r.jsx)(`span`,{"data-column":t,"data-color":n,"data-gap":i,"data-variant":a,...o})},a=t.div`
  color: red;
  font-size: 12px;
  ${e=>e.$inline===!0?`padding: 0 6px;
         border-radius: 4px;
         position: absolute;
         right: 4px;
         top: 4px;`:`margin-top: 8px;
         padding: 4px 0;
         border-top: 1px solid red;`}
`,o=t(i).attrs({gap:16,column:!0})`
  margin-bottom: 8px;
  ${e=>e.$addBottomBorder?`
      border-bottom: 1px solid ${e.theme.color.bgBorder};
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:`16px`,position:`relative`},children:[(0,r.jsx)(a,{$inline:!0,children:`Inline error`}),(0,r.jsx)(a,{$inline:!1,children:`Block error`}),(0,r.jsx)(o,{variant:`small`,color:`muted`,$hasSubtitle:!1,children:`No bottom border`}),(0,r.jsx)(o,{variant:`small`,color:`muted`,$addBottomBorder:!0,$hasSubtitle:!0,children:`Border with subtitle`}),(0,r.jsx)(o,{variant:`small`,color:`muted`,$addBottomBorder:!0,$hasSubtitle:!1,children:`Border without subtitle`})]});export{s as App};