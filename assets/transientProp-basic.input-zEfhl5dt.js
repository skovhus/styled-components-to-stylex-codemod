import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DVlcDaUT.js";import{t as i}from"./icon-BRtbV1Yd.js";var a=n();e(t(),1);var o=r.div`
  color: red;
  cursor: ${e=>e.$draggable?`move`:`pointer`};
`,s=r(({className:e,text:t,...n})=>(0,a.jsx)(`a`,{...n,className:e,children:t}))`
  color: ${e=>e.$red?`red`:`blue`};
`,c=r.div`
  position: absolute;
  width: 12px;
  height: 8px;
  background-color: white;
`;function l(e){let{$isOpen:t,...n}=e;return(0,a.jsx)(i,{...n,children:(0,a.jsx)(`svg`,{viewBox:`0 0 16 16`,children:(0,a.jsx)(`path`,{d:`M7 10.6L10.8 7.6L7 5.4V10.6Z`})})})}var u=r(l)`
  transform: rotate(${e=>e.$isOpen?`90deg`:`0deg`});
  transition: transform 0.2s;
`,d=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{$draggable:!0,children:`Draggable`}),(0,a.jsx)(o,{children:`Not Draggable`}),(0,a.jsx)(s,{text:`Click`,$red:!0}),(0,a.jsx)(s,{text:`Click`}),(0,a.jsx)(c,{$size:100,style:{top:`10px`},"data-testid":`point`}),(0,a.jsx)(u,{$isOpen:!0}),(0,a.jsx)(u,{$isOpen:!1}),(0,a.jsx)(p,{$direction:`up`,$delay:.4}),(0,a.jsx)(h,{children:`Visible`}),(0,a.jsx)(g,{children:`Reversed`})]});function f(e){let{className:t,style:n,$direction:r,$delay:i}=e;return(0,a.jsx)(`div`,{className:t,"data-direction":r,"data-delay":i,style:n})}var p=r(f)`
  max-width: 90vw;
`,m=r.div`
  opacity: ${e=>e.$open?1:0};
  transition: opacity ${e=>e.$duration}ms;
  pointer-events: ${e=>e.$open?`inherit`:`none`};
`;function h(e){let{children:t,...n}=e;return(0,a.jsx)(m,{...n,$open:!!t,$duration:350,children:t})}function g(e){let{children:t,...n}=e;return(0,a.jsx)(m,{$open:!!t,$duration:350,...n,children:t})}export{d as App,u as CollapseArrowIcon};