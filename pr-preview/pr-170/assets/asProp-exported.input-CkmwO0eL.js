import{j as t,a as e}from"./index-DKJERyte.js";const i=e.div`
  display: flex;
  flex-grow: 1;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  position: relative;
`,r=n=>t.jsx("div",{...n}),a=e(r)`
  padding: 16px;
  background: ${n=>n.variant==="primary"?"blue":"gray"};
`,s=()=>t.jsxs(t.Fragment,{children:[t.jsx(i,{onClick:()=>{}}),t.jsx(a,{variant:"primary",children:"Content"})]});export{s as App,i as ContentViewContainer,a as StyledWrapper};
