import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-Bg4LNyp5.js";n();var r=e(),i=e=>{let{column:t,color:n,gap:i,variant:a,...o}=e;return(0,r.jsx)(`span`,{"data-column":t,"data-color":n,"data-gap":i,"data-variant":a,...o})},a=t.div`
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
      border-bottom: 1px solid ${e.theme.color.bgBorderSolid};
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,s=t.div`
  padding: 8px;
  ${e=>e.$add?`color: red;`:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.$add?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,c=t.div`
  padding: 8px;
  ${e=>e.$add&&e.$hasSubtitle?`
      color: red;
      padding-bottom: 20px;
    `:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.$add&&!e.$hasSubtitle?`
      color: red;
      padding-bottom: 40px;
    `:``}
`,l=t.div`
  padding: 8px;
  ${e=>e.$add&&e.$hasSubtitle?`
      color: red;
      padding-bottom: 20px;
    `:``}
  ${e=>e.$warnColor?`color: ${e.$warnColor};`:``}
  ${e=>e.$add&&!e.$hasSubtitle?`
      color: red;
      padding-bottom: 40px;
    `:``}
`,u=t.div`
  padding: 8px;
  ${e=>e.$add?`width: ${e.$width}px;`:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.$add?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,d=t.div`
  padding: 8px;
  ${e=>e.tone===`primary`?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.tone===`primary`?``:`color: blue;`}
`,f=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:`16px`,position:`relative`},children:[(0,r.jsx)(a,{$inline:!0,children:`Inline error`}),(0,r.jsx)(a,{$inline:!1,children:`Block error`}),(0,r.jsx)(o,{variant:`small`,color:`muted`,$hasSubtitle:!1,children:`No bottom border`}),(0,r.jsx)(o,{variant:`small`,color:`muted`,$addBottomBorder:!0,$hasSubtitle:!0,children:`Border with subtitle`}),(0,r.jsx)(o,{variant:`small`,color:`muted`,$addBottomBorder:!0,$hasSubtitle:!1,children:`Border without subtitle`}),(0,r.jsx)(s,{$add:!0,$warn:!0,$hasSubtitle:!0,children:`Add + warn + subtitle stays red`}),(0,r.jsx)(s,{$add:!0,$warn:!0,$hasSubtitle:!1,children:`Add + warn + no subtitle stays red`}),(0,r.jsx)(c,{$add:!0,$warn:!0,$hasSubtitle:!0,children:`Split order subtitle stays green`}),(0,r.jsx)(c,{$add:!0,$warn:!0,$hasSubtitle:!1,children:`Split order no subtitle stays red`}),(0,r.jsx)(l,{$add:!0,$warnColor:`green`,$hasSubtitle:!0,children:`Dynamic order subtitle stays green`}),(0,r.jsx)(l,{$add:!0,$warnColor:`green`,$hasSubtitle:!1,children:`Dynamic order no subtitle stays red`}),(0,r.jsx)(u,{$add:!0,$warn:!0,$hasSubtitle:!0,$width:80,children:`Style fn parent subtitle stays red`}),(0,r.jsx)(u,{$add:!0,$warn:!0,$hasSubtitle:!1,$width:80,children:`Style fn parent no subtitle stays red`}),(0,r.jsx)(d,{tone:`primary`,$warn:!0,$hasSubtitle:!0,children:`Primary inverse subtitle stays green`}),(0,r.jsx)(d,{tone:`primary`,$warn:!0,$hasSubtitle:!1,children:`Primary inverse no subtitle stays green`}),(0,r.jsx)(d,{tone:`secondary`,$warn:!1,$hasSubtitle:!0,children:`Secondary inverse stays blue`})]});export{f as App};