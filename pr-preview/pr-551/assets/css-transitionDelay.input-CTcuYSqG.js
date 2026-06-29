import{s as e,t}from"./jsx-runtime-D4ePz0Hl.js";import{m as n,u as r}from"./index-CJf-ThBW.js";var i=e(n(),1),a=t(),o=`cubic-bezier(0.25, 0.46, 0.45, 0.94)`,s=r.div`
  opacity: ${e=>+!!e.$open};
  transition: opacity 200ms ease-out;
  transition-delay: ${e=>e.$open?e.$delay:0}ms;
  background-color: #3b82f6;
  color: white;
  padding: 16px 20px;
  border-radius: 8px;
`,c=r.div`
  opacity: ${e=>+!!e.$visible};
  transition: opacity ${e=>e.$visible?400:100}ms ${o};
  padding: 12px;
  background-color: #fef3c7;
`;function l(e){let{children:t,...n}=e;return(0,a.jsx)(s,{...n,children:t})}var u=()=>{let[e,t]=i.useState(!0);return i.useEffect(()=>{let e=window.setInterval(()=>t(e=>!e),1200);return()=>window.clearInterval(e)},[]),(0,a.jsxs)(`div`,{style:{display:`flex`,gap:12,fontFamily:`system-ui`,fontSize:14},children:[(0,a.jsx)(l,{$open:e,$delay:0,children:`0ms delay`}),(0,a.jsx)(l,{$open:e,$delay:200,children:`200ms delay`}),(0,a.jsx)(l,{$open:e,$delay:600,children:`600ms delay`}),(0,a.jsx)(c,{$visible:e,children:`Dynamic shorthand`})]})};export{u as App,l as AutoFadingContainer};