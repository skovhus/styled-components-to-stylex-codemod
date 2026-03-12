import{j as o,c as r}from"./index-BHMsCUVz.js";const e=r.div`
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
`,l=()=>o.jsx(e,{children:"Hover or focus me, and resize!"});export{l as App};
