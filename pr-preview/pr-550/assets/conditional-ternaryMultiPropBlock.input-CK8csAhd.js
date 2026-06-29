import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BV12Yy_2.js";import{c as r}from"./helpers-BK3Tsz4e.js";t();var i=e(),a=e=>{let{column:t,color:n,gap:r,variant:a,...o}=e;return(0,i.jsx)(`span`,{"data-column":t,"data-color":n,"data-gap":r,"data-variant":a,...o})},o=n.div`
  color: red;
  font-size: 12px;
  ${e=>e.$inline===!0?`padding: 0 6px;
         border-radius: 4px;
         position: absolute;
         right: 4px;
         top: 4px;`:`margin-top: 8px;
         padding: 4px 0;
         border-top: 1px solid red;`}
`,s=n(a).attrs({gap:16,column:!0})`
  margin-bottom: 8px;
  ${e=>e.$addBottomBorder?`
      border-bottom: 1px solid ${e.theme.color.bgBorderSolid};
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,c=n.div`
  padding: 8px;
  ${e=>e.$add?`color: red;`:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.$add?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,l=n.div`
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
`,u=n.div`
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
`,d=n.div`
  padding: 8px;
  ${e=>e.$add?`width: ${e.$width}px;`:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.$add?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,f=n.div`
  padding: 8px;
  ${e=>e.tone===`primary`?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.tone===`primary`?``:`color: blue;`}
`,p=n.div`
  padding: 8px;
  ${e=>e.$add?``:`color: blue;`}
  ${e=>e.$add?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,m=n.div`
  padding: 8px;
  ${e=>e.$fooBar?`color: blue;`:``}
  ${e=>e.$foo&&e.$bar?`
      color: red;
      ${e.$baz?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,h=n.div`
  padding: 8px;
  color: ${e=>e.$color};
  ${e=>e.$color?`
      border-color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,g=n.div`
  padding: 8px;
  ${r()}
  background: white;
  ${e=>e.$after1?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,_=n.div`
  padding: 8px;
  ${e=>e.$add?`color: red;`:``}
  ${e=>e.$warn?`color: green;`:``}
  ${e=>e.$add?`
      ${e.$hasSubtitle?`background: #fff0f0;`:`background: #fff8e1;`}
    `:``}
`,v=n.div.withConfig({shouldForwardProp:e=>!e.startsWith(`$`)})`
  padding: 8px;
  width: ${e=>e.$add}px;
  height: ${e=>e.$add}px;
  ${e=>e.$add?`
      color: red;
      ${e.$hasSubtitle?`padding-bottom: 20px;`:`padding-bottom: 40px;`}
    `:``}
`,y=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:`16px`,position:`relative`},children:[(0,i.jsx)(o,{$inline:!0,children:`Inline error`}),(0,i.jsx)(o,{$inline:!1,children:`Block error`}),(0,i.jsx)(s,{variant:`small`,color:`muted`,$hasSubtitle:!1,children:`No bottom border`}),(0,i.jsx)(s,{variant:`small`,color:`muted`,$addBottomBorder:!0,$hasSubtitle:!0,children:`Border with subtitle`}),(0,i.jsx)(s,{variant:`small`,color:`muted`,$addBottomBorder:!0,$hasSubtitle:!1,children:`Border without subtitle`}),(0,i.jsx)(c,{$add:!0,$warn:!0,$hasSubtitle:!0,children:`Add + warn + subtitle stays red`}),(0,i.jsx)(c,{$add:!0,$warn:!0,$hasSubtitle:!1,children:`Add + warn + no subtitle stays red`}),(0,i.jsx)(l,{$add:!0,$warn:!0,$hasSubtitle:!0,children:`Split order subtitle stays green`}),(0,i.jsx)(l,{$add:!0,$warn:!0,$hasSubtitle:!1,children:`Split order no subtitle stays red`}),(0,i.jsx)(u,{$add:!0,$warnColor:`green`,$hasSubtitle:!0,children:`Dynamic order subtitle stays green`}),(0,i.jsx)(u,{$add:!0,$warnColor:`green`,$hasSubtitle:!1,children:`Dynamic order no subtitle stays red`}),(0,i.jsx)(d,{$add:!0,$warn:!0,$hasSubtitle:!0,$width:80,children:`Style fn parent subtitle stays red`}),(0,i.jsx)(d,{$add:!0,$warn:!0,$hasSubtitle:!1,$width:80,children:`Style fn parent no subtitle stays red`}),(0,i.jsx)(f,{tone:`primary`,$warn:!0,$hasSubtitle:!0,children:`Primary inverse subtitle stays green`}),(0,i.jsx)(f,{tone:`primary`,$warn:!0,$hasSubtitle:!1,children:`Primary inverse no subtitle stays green`}),(0,i.jsx)(f,{tone:`secondary`,$warn:!1,$hasSubtitle:!0,children:`Secondary inverse stays blue`}),(0,i.jsx)(p,{$add:!0,$hasSubtitle:!0,children:`Grouped inverse subtitle stays red`}),(0,i.jsx)(p,{$add:!0,$hasSubtitle:!1,children:`Grouped inverse no subtitle stays red`}),(0,i.jsx)(p,{$add:!1,$hasSubtitle:!0,children:`Grouped inverse no add stays blue`}),(0,i.jsx)(m,{$foo:!0,$bar:!0,$baz:!0,$fooBar:!1,children:`Key collision factored branch stays red`}),(0,i.jsx)(m,{$foo:!1,$bar:!1,$baz:!1,$fooBar:!0,children:`Key collision existing prop stays blue`}),(0,i.jsx)(h,{$color:`green`,$hasSubtitle:!0,children:`Style fn key collision keeps green text`}),(0,i.jsx)(h,{$color:`green`,$hasSubtitle:!1,children:`Style fn key collision no subtitle keeps green text`}),(0,i.jsx)(g,{$after1:!0,$hasSubtitle:!0,children:`After-base key collision subtitle stays red`}),(0,i.jsx)(g,{$after1:!0,$hasSubtitle:!1,children:`After-base key collision no subtitle stays red`}),(0,i.jsx)(_,{$add:!0,$warn:!0,$hasSubtitle:!0,children:`Stale bucket subtitle stays green`}),(0,i.jsx)(_,{$add:!0,$warn:!0,$hasSubtitle:!1,children:`Stale bucket no subtitle stays green`}),(0,i.jsx)(v,{$add:80,$hasSubtitle:!0,children:`Consolidated key collision subtitle stays red`}),(0,i.jsx)(v,{$add:80,$hasSubtitle:!1,children:`Consolidated key collision no subtitle stays red`})]});export{y as App};