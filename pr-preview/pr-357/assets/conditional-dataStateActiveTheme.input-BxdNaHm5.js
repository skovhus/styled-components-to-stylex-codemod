import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CyUUxAP6.js";var n=e(),r=t.div`
  display: flex;
  padding: 1px;
  border-radius: 6px;
  background: ${e=>e.theme.isDark?e.theme.color.bgBase:e.theme.color.bgSub};
`,i=t.button`
  flex: 1;
  min-height: 32px;
  font-size: 14px;
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="inactive"] {
    color: #999;
  }

  &[data-state="active"] {
    background: ${e=>e.theme.color.bgBase};
    box-shadow: 0 0 0 1px ${e=>e.theme.color.bgBorderFaint},
      0 1px 2px rgba(0, 0, 0, 0.1);
  }
`,a=()=>(0,n.jsxs)(r,{children:[(0,n.jsx)(i,{"data-state":`active`,children:`Active Tab`}),(0,n.jsx)(i,{"data-state":`inactive`,children:`Inactive Tab`}),(0,n.jsx)(i,{"data-state":`active`,children:`Another Active`})]});export{a as App};