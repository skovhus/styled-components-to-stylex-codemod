import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r,u as i}from"./index-BEHMEpNn.js";e(t(),1);var a=n();function o(e){return(0,a.jsx)(`span`,{className:e.className,style:e.style,children:e.children})}function s(e){let{$isExpanded:t,...n}=e;return(0,a.jsx)(o,{...n,children:(0,a.jsx)(`svg`,{viewBox:`0 0 16 16`,children:(0,a.jsx)(`path`,{d:t?`M3 10L8 5L13 10`:`M3 6L8 11L13 6`})})})}var c=r(s)`
  transition: transform 0.15s ease;
  cursor: pointer;
  padding: 4px;
  ${e=>e.$isExpanded&&i`
      transform: rotate(180deg);
    `}
`,l=r.div`
  display: inline-flex;
  align-items: center;
  padding: ${e=>e.$compact?`2px 6px`:`4px 12px`};
  border-radius: 12px;
  font-size: ${e=>e.$compact?`11px`:`13px`};
  background-color: ${e=>e.$variant===`success`?`green`:e.$variant===`warning`?`orange`:`red`};
  color: white;
`,u=r.span`
  font-weight: ${e=>e.$bold?700:400};
`,d=r.div`
  background-color: ${e=>e.$color};
  color: ${e=>e.color};
  padding: 4px 8px;
  border-radius: 4px;
`,f=r.div`
  border: 2px solid ${e=>e.$highlighted?`gold`:`gray`};
  padding: 4px 8px;
  border-radius: 4px;
`;function p(){return(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:12,padding:16},children:[(0,a.jsxs)(`div`,{style:{display:`flex`,gap:8},children:[(0,a.jsx)(c,{$isExpanded:!0,children:`Expanded`}),(0,a.jsx)(c,{$isExpanded:!1,children:`Collapsed`})]}),(0,a.jsxs)(`div`,{style:{display:`flex`,gap:8},children:[(0,a.jsx)(l,{$variant:`success`,children:`OK`}),(0,a.jsx)(l,{$variant:`warning`,$compact:!0,children:`Warn`}),(0,a.jsx)(l,{$variant:`error`,$compact:!1,children:`Fail`})]}),(0,a.jsx)(u,{$bold:!0,children:`Bold text`}),(0,a.jsx)(u,{children:`Normal text`}),(0,a.jsx)(d,{$color:`blue`,color:`white`,children:`Collision kept`}),(0,a.jsx)(f,{$highlighted:!0,children:`Highlighted`}),(0,a.jsx)(f,{children:`Normal`})]})}export{p as App,d as ColorChip,f as SpecifierTag,l as StatusBadge,c as TreeToggle};