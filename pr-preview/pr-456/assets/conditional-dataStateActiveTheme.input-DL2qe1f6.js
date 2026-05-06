import{c as e,p as t}from"./index-CI1T4AZT.js";var n=t(),r=e.div`
  display: flex;
  padding: 1px;
  border-radius: 6px;
  background: ${e=>e.theme.isDark?e.theme.color.bgBase:e.theme.color.bgSub};
`,i=e.button`
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