import{j as t,c as e}from"./index-FP_Cx-M0.js";const i=e.div`
  display: flex;
  flex-grow: 1;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  position: relative;
`,r=n=>t.jsx("div",{...n}),o=e(r)`
  padding: 16px;
  background: ${n=>n.variant==="primary"?"blue":"gray"};
`,s=()=>t.jsxs(t.Fragment,{children:[t.jsx(i,{onClick:()=>{}}),t.jsx(o,{variant:"primary",children:"Content"})]});export{s as App,i as ContentViewContainer,o as StyledWrapper};
