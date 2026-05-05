import{c as e,p as t}from"./index-DTT2cnJb.js";var n=t(),r=e.div`
  border-right: 1px solid hotpink;
  color: blue;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: "🔥";
  }

  &::after {
    content: attr(data-label);
  }
`,i=()=>(0,n.jsx)(r,{"data-label":` after`,children:`Hover me!`});export{i as App};