import { JoinColumnOptions, RelationOptions } from "typeorm";
import { JoinTableMultipleColumnsOptions } from "typeorm/decorator/options/JoinTableMultipleColumnsOptions";

export type Relation = {
    relationType: "OneToOne" | "OneToMany" | "ManyToOne" | "ManyToMany";
    relatedSchema?: string;
    relatedTable: string;
    relatedField: string;
    schemaName?: string;
    fieldName: string;
    relationOptions?: RelationOptions;
    joinColumnOptions?: Required<JoinColumnOptions>[];
    joinTableOptions?: JoinTableMultipleColumnsOptions;
};
