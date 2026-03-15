import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-BFw42tS8.js";var i=e(t(),1),a=n(),o=r.div`
  opacity: ${e=>e.$open?1:0};
  transition: opacity 200ms ease-out;
  transition-delay: ${e=>e.$open?e.$delay:0}ms;
  background-color: #3b82f6;
  color: white;
  padding: 16px 20px;
  border-radius: 8px;
`;function s(e){let{children:t,...n}=e;return(0,a.jsx)(o,{...n,children:t})}var c=()=>{let[e,t]=i.useState(!0);return i.useEffect(()=>{let e=window.setInterval(()=>t(e=>!e),1200);return()=>window.clearInterval(e)},[]),(0,a.jsxs)(`div`,{style:{display:`flex`,gap:12,fontFamily:`system-ui`,fontSize:14},children:[(0,a.jsx)(s,{$open:e,$delay:0,children:`0ms delay`}),(0,a.jsx)(s,{$open:e,$delay:200,children:`200ms delay`}),(0,a.jsx)(s,{$open:e,$delay:600,children:`600ms delay`})]})};export{c as App,s as AutoFadingContainer};