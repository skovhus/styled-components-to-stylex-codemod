import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n,p as r}from"./index-B_scv41m.js";r();var i=e(),a=n.button`
  padding: 8px 16px;
  border-radius: 4px;

  ${e=>e.$primary?t`
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
        `:t`
          background: ${e.theme.color.bgBase};
          color: black;
        `}
`;function o(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Normal`}),(0,i.jsx)(a,{$primary:!0,children:`Primary`})]})}export{o as App,a as Button};