import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";var n=e();function r(e){let{column:t,gap:r,className:i,style:a,children:o}=e;return(0,n.jsx)(`div`,{className:i,style:{display:`flex`,flexDirection:t?`column`:`row`,gap:r,...a},children:o})}var i=t(r)`
  overflow-y: auto;
  background-color: ${e=>e.$applyBackground?`gray`:`inherit`};
`,a=t.div`
  padding: ${e=>e.$size===`large`?`16px`:`8px`};
  background: ${e=>e.$isActive?`blue`:`gray`};
  color: white;
`,o=t.img`
  opacity: ${e=>e.$isInactive?.5:1};
  border-radius: 50%;
`,s=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsxs)(i,{$applyBackground:!0,column:!0,gap:10,children:[(0,n.jsx)(`div`,{children:`Item 1`}),(0,n.jsx)(`div`,{children:`Item 2`})]}),(0,n.jsx)(a,{$isActive:!0,$size:`large`,children:`Active large box`}),(0,n.jsx)(a,{$size:`small`,children:`Small inactive box`}),(0,n.jsx)(o,{$isInactive:!0,src:`/avatar.png`,alt:`Avatar`})]});export{s as App,a as Box,o as Image,i as Scrollable};