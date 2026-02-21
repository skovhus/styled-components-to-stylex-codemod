import{j as e,Q as t,t as n,c as p,h as d,R as a}from"./index-DHeQ_gfE.js";const s=n,c=p.div`
  padding: 12px 16px;
  background-color: ${o=>o.theme.color.primaryColor};
  color: white;
  border-radius: 8px;
`;class i extends a.Component{render(){const r=this.props.theme??s;return e.jsx("div",{style:{color:r.color.primaryColor},children:"Themed Component"})}}const l=d(i),h=()=>e.jsx(t,{theme:s,children:e.jsxs("div",{style:{display:"grid",gap:"12px",padding:"12px"},children:[e.jsx(c,{children:"Panel"}),e.jsx(l,{})]})});export{h as App};
