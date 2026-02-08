import{j as e,K as t,t as n,a as d,d as p,R as a}from"./index-ByUSJ-O2.js";const s=n,i=d.div`
  padding: 12px 16px;
  background-color: ${o=>o.theme.color.primaryColor};
  color: white;
  border-radius: 8px;
`;class l extends a.Component{render(){const r=this.props.theme??s;return e.jsx("div",{style:{color:r.color.primaryColor},children:"Themed Component"})}}const c=p(l),x=()=>e.jsx(t,{theme:s,children:e.jsxs("div",{style:{display:"grid",gap:"12px",padding:"12px"},children:[e.jsx(i,{children:"Panel"}),e.jsx(c,{})]})});export{x as App};
