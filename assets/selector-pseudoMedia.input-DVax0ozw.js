import{c as e,p as t}from"./index-DDUSP3M2.js";var n=t(),r=e.div`
  color: blue;
  background-color: white;

  &:hover {
    color: red;
    background-color: lightblue;
  }

  &:focus-visible {
    color: green;
    outline: 2px solid blue;
  }

  @media (max-width: 600px) {
    color: orange;
    background-color: gray;
  }
`,i=()=>(0,n.jsx)(r,{children:`Hover or focus me, and resize!`});export{i as App};