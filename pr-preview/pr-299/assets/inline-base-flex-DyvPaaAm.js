import{s as e,c}from"./index-BHScqglL.js";const n={start:"flex-start",center:"center",end:"flex-end",stretch:"stretch"},i=c.div`
  display: flex;
  ${({column:t,direction:s})=>t?e`
          flex-direction: column;
        `:s?e`
            flex-direction: ${s};
          `:""}
  ${({gap:t})=>t!==void 0?e`
          gap: ${t}px;
        `:""}
  ${({align:t})=>t?e`
          align-items: ${n[t]};
        `:""}
  ${({center:t})=>t?e`
          align-items: center;
          justify-content: center;
        `:""}
`;export{i as F};
