import{f as e,s as t}from"./index-xhxDhZ8Y.js";var n=e(),r=t.div`
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