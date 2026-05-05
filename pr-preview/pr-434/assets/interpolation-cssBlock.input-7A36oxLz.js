import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n,u as r}from"./index-nMfYBfYl.js";t();var i=e(),a=n.button`
  padding: 8px 16px;
  border-radius: 4px;

  ${e=>e.$primary?r`
          background: blue;
          color: white;

          &:after {
            content: "";
            position: absolute;
            inset: 0 4px;
            background-color: hotpink;
            z-index: -1;
            border-radius: 6px;
          }
        `:r`
          background: ${e.theme.color.bgBase};
          color: black;
        `}
`;function o(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Normal`}),(0,i.jsx)(a,{$primary:!0,children:`Primary`})]})}export{o as App,a as Button};