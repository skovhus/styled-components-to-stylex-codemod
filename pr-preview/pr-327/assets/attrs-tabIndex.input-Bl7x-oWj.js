import{j as t,c as l}from"./index-CmWJAfg9.js";import{F as o}from"./flex-GAf3RjIr.js";const r=l(o).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:"inherit"};
  scrollbar-gutter: ${e=>e.gutter||"auto"};
  &:focus-visible {
    outline: none;
  }
`,a=l.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:"inherit"};
  scrollbar-gutter: ${e=>e.gutter||"auto"};
  &:focus-visible {
    outline: none;
  }
`,n=()=>t.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",height:"200px"},children:[t.jsx(r,{gutter:"stable",$applyBackground:!0,children:t.jsx("div",{style:{height:"400px",padding:"8px"},children:"Flex: Tab me! (scrollable with stable gutter)"})}),t.jsx(a,{gutter:"stable",children:t.jsx("div",{style:{height:"400px",padding:"8px"},children:"Div: Tab me! (scrollable with stable gutter)"})})]});export{n as App,a as ScrollableDiv,r as ScrollableFlex};
