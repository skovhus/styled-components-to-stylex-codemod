import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-Dda2rlA_.js";import{n as i,t as a}from"./user-avatar-DCygiKxK.js";e(t(),1);var o=n(),s=r(i.div)`
  background: white;
  border-radius: ${e=>e.$isOpen?`8px`:`20px`};
  overflow: hidden;
`,c=r(a)`
  box-shadow: 0 0 0 2px ${e=>e.$highlightColor??`transparent`};
  border-radius: 50%;
`,l=()=>(0,o.jsxs)(`div`,{children:[(0,o.jsx)(s,{$isOpen:!0,initial:{height:40},animate:{height:200},children:`Open content`}),(0,o.jsx)(s,{$isOpen:!1,initial:{height:40},animate:{height:40},children:`Closed`}),(0,o.jsx)(c,{user:`Alice`,size:`small`,$highlightColor:`blue`}),(0,o.jsx)(c,{user:`Bob`,size:`tiny`})]});export{l as App};