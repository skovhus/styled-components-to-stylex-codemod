import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-DaG6dTaB.js";import{t as r}from"./icon-DhBd8sbL.js";var i=e();t();var a=n.div`
  color: red;
  cursor: ${e=>e.$draggable?`move`:`pointer`};
`,o=n(({className:e,text:t,...n})=>(0,i.jsx)(`a`,{...n,className:e,children:t}))`
  color: ${e=>e.$red?`red`:`blue`};
`,s=n.div`
  position: absolute;
  width: 12px;
  height: 8px;
  background-color: white;
`;function c(e){let{$isOpen:t,...n}=e;return(0,i.jsx)(r,{...n,children:(0,i.jsx)(`svg`,{viewBox:`0 0 16 16`,children:(0,i.jsx)(`path`,{d:`M7 10.6L10.8 7.6L7 5.4V10.6Z`})})})}var l=n(c)`
  transform: rotate(${e=>e.$isOpen?`90deg`:`0deg`});
  transition: transform 0.2s;
`,u=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{$draggable:!0,children:`Draggable`}),(0,i.jsx)(a,{children:`Not Draggable`}),(0,i.jsx)(o,{text:`Click`,$red:!0}),(0,i.jsx)(o,{text:`Click`}),(0,i.jsx)(s,{$size:100,style:{top:`10px`},"data-testid":`point`}),(0,i.jsx)(l,{$isOpen:!0}),(0,i.jsx)(l,{$isOpen:!1}),(0,i.jsx)(f,{$direction:`up`,$delay:.4}),(0,i.jsx)(m,{children:`Visible`}),(0,i.jsx)(h,{children:`Reversed`}),(0,i.jsx)(_,{}),(0,i.jsx)(y,{})]});function d(e){let{className:t,style:n,$direction:r,$delay:a}=e;return(0,i.jsx)(`div`,{className:t,"data-direction":r,"data-delay":a,style:n})}var f=n(d)`
  max-width: 90vw;
`,p=n.div`
  opacity: ${e=>+!!e.$open};
  transition: opacity ${e=>e.$duration}ms;
  pointer-events: ${e=>e.$open?`inherit`:`none`};
`;function m(e){let{children:t,...n}=e;return(0,i.jsx)(p,{...n,$open:!!t,$duration:350,children:t})}function h(e){let{children:t,...n}=e;return(0,i.jsx)(p,{$open:!!t,$duration:350,...n,children:t})}var g=n.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: ${e=>e.$zIndex};
`;function _(){return(0,i.jsx)(g,{$zIndex:1,onClick:()=>{},children:`hello`})}var v=n.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: ${e=>e.$zIndex};
`;function y(e){return(0,i.jsx)(v,{...e,$zIndex:10,children:`hello`})}export{u as App,l as CollapseArrowIcon};