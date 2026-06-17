import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-CdWUP655.js";n();var i=e();function a(e){return(0,i.jsx)(`span`,{className:e.className,style:e.style,children:e.children})}function o(e){let{$isExpanded:t,...n}=e;return(0,i.jsx)(a,{...n,children:(0,i.jsx)(`svg`,{viewBox:`0 0 16 16`,children:(0,i.jsx)(`path`,{d:t?`M3 10L8 5L13 10`:`M3 6L8 11L13 6`})})})}var s=r(o)`
  transition: transform 0.15s ease;
  cursor: pointer;
  padding: 4px;
  ${e=>e.$isExpanded&&t`
      transform: rotate(180deg);
    `}
`,c=r.div`
  display: inline-flex;
  align-items: center;
  padding: ${e=>e.$compact?`2px 6px`:`4px 12px`};
  border-radius: 12px;
  font-size: ${e=>e.$compact?`11px`:`13px`};
  background-color: ${e=>e.$variant===`success`?`green`:e.$variant===`warning`?`orange`:`red`};
  color: white;
`,l=r.span`
  font-weight: ${e=>e.$bold?700:400};
`,u=r.div`
  background-color: ${e=>e.$color};
  color: ${e=>e.color};
  padding: 4px 8px;
  border-radius: 4px;
`,d=r.div`
  border: 2px solid ${e=>e.$highlighted?`gold`:`gray`};
  padding: 4px 8px;
  border-radius: 4px;
`;function f(){return(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:12,padding:16},children:[(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8},children:[(0,i.jsx)(s,{$isExpanded:!0,children:`Expanded`}),(0,i.jsx)(s,{$isExpanded:!1,children:`Collapsed`})]}),(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8},children:[(0,i.jsx)(c,{$variant:`success`,children:`OK`}),(0,i.jsx)(c,{$variant:`warning`,$compact:!0,children:`Warn`}),(0,i.jsx)(c,{$variant:`error`,$compact:!1,children:`Fail`})]}),(0,i.jsx)(l,{$bold:!0,children:`Bold text`}),(0,i.jsx)(l,{children:`Normal text`}),(0,i.jsx)(u,{$color:`blue`,color:`white`,children:`Collision kept`}),(0,i.jsx)(d,{$highlighted:!0,children:`Highlighted`}),(0,i.jsx)(d,{children:`Normal`})]})}export{f as App,u as ColorChip,d as SpecifierTag,c as StatusBadge,s as TreeToggle};