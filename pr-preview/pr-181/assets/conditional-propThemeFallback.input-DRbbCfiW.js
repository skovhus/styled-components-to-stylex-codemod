import{j as l,a as t}from"./index-BXl6qirZ.js";const e=t("div")`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;

  ${o=>o.hollow?`border: solid 1px ${o.color?o.color:o.theme.color.labelMuted}`:`background-color: ${o.color?o.color:o.theme.color.labelMuted}`};

  ${o=>o.size==="tiny"&&`
    width: 7px;
    height: 7px;
  `};

  ${o=>o.size==="small"&&`
    width: 9px;
    height: 9px;
  `};
`,r=()=>l.jsxs("div",{children:[l.jsx(e,{}),l.jsx(e,{color:"hotpink"}),l.jsx(e,{hollow:!0}),l.jsx(e,{hollow:!0,color:"hotpink"}),l.jsx(e,{size:"tiny"}),l.jsx(e,{size:"small"}),l.jsx(e,{color:"#ff0000"})]});export{r as App,e as ColorBadge};
