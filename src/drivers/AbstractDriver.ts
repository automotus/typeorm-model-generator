import {
    WithLengthColumnType,
    WithPrecisionColumnType,
    WithWidthColumnType,
} from "typeorm/driver/types/ColumnTypes";
import { JoinColumnOptions, RelationOptions } from "typeorm";
import { DataTypeDefaults } from "typeorm/driver/types/DataTypeDefaults";
import * as TomgUtils from "../Utils";
import IConnectionOptions from "../IConnectionOptions";
import { Entity } from "../models/Entity";
import { RelationInternal } from "../models/RelationInternal";
import { Relation } from "../models/Relation";
import IGenerationOptions from "../IGenerationOptions";
import { Column } from "../models/Column";

export default abstract class AbstractDriver {
    public abstract standardPort: number;

    public abstract standardSchema: string;

    public abstract standardUser: string;

    public abstract defaultValues: DataTypeDefaults;

    public ColumnTypesWithWidth: WithWidthColumnType[] = [
        "tinyint",
        "smallint",
        "mediumint",
        "int",
        "bigint",
    ];

    public ColumnTypesWithPrecision: WithPrecisionColumnType[] = [
        "float",
        "double",
        "dec",
        "decimal",
        "numeric",
        "real",
        "double precision",
        "number",
        "datetime",
        "datetime2",
        "datetimeoffset",
        "time",
        "time with time zone",
        "time without time zone",
        "timestamp",
        "timestamp without time zone",
        "timestamp with time zone",
        "timestamp with local time zone",
    ];

    public ColumnTypesWithLength: WithLengthColumnType[] = [
        "character varying",
        "varying character",
        "nvarchar",
        "character",
        "native character",
        "varchar",
        "char",
        "nchar",
        "varchar2",
        "nvarchar2",
        "raw",
        "binary",
        "varbinary",
    ];

    public static FindManyToManyRelations(dbModel: Entity[]) {
        let retVal = dbModel;
        const manyToManyEntities = retVal.filter(
            (entity) =>
                entity.relations.length === 2 &&
                entity.relations.every(
                    (v) =>
                        v.joinColumnOptions && v.relationType !== "ManyToMany"
                ) &&
                `${entity.relations[0].relatedTable}${entity.relations[0].relatedSchema}` !==
                    `${entity.relations[1].relatedTable}${entity.relations[1].relatedSchema}` &&
                entity.relations[0].joinColumnOptions!.length ===
                    entity.relations[1].joinColumnOptions!.length &&
                entity.columns.length ===
                    entity.columns.filter((c) => c.primary).length &&
                entity.columns
                    .map((v) => v.tscName)
                    .filter(
                        (v) =>
                            !entity.relations[0]
                                .joinColumnOptions!.map((x) => x.name)
                                .some((jc) => jc === v) &&
                            !entity.relations[1]
                                .joinColumnOptions!.map((x) => x.name)
                                .some((jc) => jc === v)
                    ).length === 0
        );
        manyToManyEntities.forEach((junctionEntity) => {
            const firstEntity = dbModel.find((v) => {
                return (
                    v.tscName === junctionEntity.relations[0].relatedTable &&
                    v.schema === junctionEntity.relations[0].relatedSchema
                );
            })!;
            const secondEntity = dbModel.find((v) => {
                return (
                    v.tscName === junctionEntity.relations[1].relatedTable &&
                    v.schema === junctionEntity.relations[1].relatedSchema
                );
            })!;

            const firstRelation = firstEntity.relations.find((v) => {
                return (
                    v.relatedTable === junctionEntity.tscName &&
                    v.relatedSchema === junctionEntity.schema
                );
            })!;
            const secondRelation = secondEntity.relations.find((v) => {
                return (
                    v.relatedTable === junctionEntity.tscName &&
                    v.relatedSchema === junctionEntity.schema
                );
            })!;

            firstRelation.relationType = "ManyToMany";
            secondRelation.relationType = "ManyToMany";
            firstRelation.relatedTable = secondEntity.tscName;
            firstRelation.relatedSchema = secondEntity.schema;
            secondRelation.relatedTable = firstEntity.tscName;
            secondRelation.relatedSchema = firstEntity.schema;

            firstRelation.fieldName = TomgUtils.findNameForNewField(
                secondEntity.tscName,
                firstEntity
            );
            secondRelation.fieldName = TomgUtils.findNameForNewField(
                firstEntity.tscName,
                secondEntity
            );
            firstRelation.relatedField = secondRelation.fieldName;
            secondRelation.relatedField = firstRelation.fieldName;

            firstRelation.joinTableOptions = {
                name: junctionEntity.sqlName,
                joinColumns: junctionEntity.relations[0].joinColumnOptions!.map(
                    (v, i) => {
                        return {
                            referencedColumnName: v.referencedColumnName,
                            name: junctionEntity.relations[0]
                                .joinColumnOptions![i].name,
                        };
                    }
                ),
                inverseJoinColumns:
                    junctionEntity.relations[1].joinColumnOptions!.map(
                        (v, i) => {
                            return {
                                referencedColumnName: v.referencedColumnName,
                                name: junctionEntity.relations[1]
                                    .joinColumnOptions![i].name,
                            };
                        }
                    ),
            };
            if (junctionEntity.database) {
                firstRelation.joinTableOptions.database =
                    junctionEntity.database;
            }
            if (junctionEntity.schema) {
                firstRelation.joinTableOptions.schema = junctionEntity.schema;
            }

            firstRelation.relationOptions = undefined;
            secondRelation.relationOptions = undefined;
            firstRelation.joinColumnOptions = undefined;
            secondRelation.joinColumnOptions = undefined;
            retVal = retVal.filter((ent) => {
                return ent.tscName !== junctionEntity.tscName;
            });
        });
        return retVal;
    }

    static FilterGeneratedTables(
        dbModel: Entity[],
        skipTables: string[],
        onlyTables: string[]
    ): Entity[] {
        return dbModel
            .filter((table) => !skipTables.includes(table.sqlName))
            .filter(
                (table) =>
                    onlyTables.length === 0 ||
                    onlyTables.includes(table.sqlName)
            );
    }

    public static GetRelationsFromRelationTempInfo(
        relationsTemp: RelationInternal[],
        entities: Entity[],
        generationOptions: IGenerationOptions
    ) {
        relationsTemp.forEach((relationTmp) => {
            const ownerEntity = entities.find((entity) => {
                return (
                    entity.tscName === relationTmp.ownerTable.tscName &&
                    entity.schema === relationTmp.ownerTable.schema
                );
            });
            if (!ownerEntity) {
                TomgUtils.LogError(
                    `Relation between tables ${relationTmp.ownerTable.sqlName} and ${relationTmp.relatedTable.sqlName} didn't found entity model ${relationTmp.ownerTable.sqlName}.`
                );
                return;
            }
            const referencedEntity = entities.find((entity) => {
                return (
                    entity.tscName === relationTmp.relatedTable.tscName &&
                    entity.schema === relationTmp.relatedTable.schema
                );
            });
            if (!referencedEntity) {
                TomgUtils.LogError(
                    `Relation between tables ${relationTmp.ownerTable.sqlName} and ${relationTmp.relatedTable.sqlName} didn't found entity model ${relationTmp.relatedTable.sqlName}.`
                );
                return;
            }

            const ownerColumns: Column[] = [];
            const relatedColumns: Column[] = [];
            for (
                let relationColumnIndex = 0;
                relationColumnIndex < relationTmp.ownerColumns.length;
                relationColumnIndex++
            ) {
                const ownerColumn = ownerEntity.columns.find(
                    (column) =>
                        column.tscName ===
                        relationTmp.ownerColumns[relationColumnIndex]
                );
                if (!ownerColumn) {
                    TomgUtils.LogError(
                        `Relation between tables ${relationTmp.ownerTable.sqlName} and ${relationTmp.relatedTable.sqlName} didn't found entity column ${relationTmp.ownerTable.sqlName}.${ownerColumn}.`
                    );
                    return;
                }
                const relatedColumn = referencedEntity.columns.find(
                    (column) =>
                        column.tscName ===
                        relationTmp.relatedColumns[relationColumnIndex]
                );
                if (!relatedColumn) {
                    TomgUtils.LogError(
                        `Relation between tables ${relationTmp.ownerTable.sqlName} and ${relationTmp.relatedTable.sqlName} didn't found entity column ${relationTmp.relatedTable.sqlName}.${relatedColumn}.`
                    );
                    return;
                }
                ownerColumns.push(ownerColumn);
                relatedColumns.push(relatedColumn);
            }
            let isOneToMany: boolean;
            isOneToMany = false;
            const index = ownerEntity.indices.find(
                (ind) =>
                    ind.options.unique &&
                    ind.columns.length === ownerColumns.length &&
                    ownerColumns.every((ownerColumn) =>
                        ind.columns.some((col) => col === ownerColumn.tscName)
                    )
            );
            isOneToMany = !index;

            ownerColumns.forEach((column) => {
                column.isUsedInRelationAsOwner = true;
            });
            relatedColumns.forEach((column) => {
                column.isUsedInRelationAsReferenced = true;
            });
            let fieldName = "";
            if (ownerColumns.length === 1) {
                fieldName = TomgUtils.findNameForNewField(
                    ownerColumns[0].tscName,
                    ownerEntity
                );
            } else {
                fieldName = TomgUtils.findNameForNewField(
                    relationTmp.relatedTable.tscName,
                    ownerEntity
                );
            }

            const relationOptions: RelationOptions = {
                onDelete: relationTmp.onDelete,
                onUpdate: relationTmp.onUpdate,
            };

            const ownerRelation: Relation = {
                fieldName,
                schemaName: relationTmp.ownerTable.schema,
                relatedField: TomgUtils.findNameForNewField(
                    relationTmp.ownerTable.tscName,
                    relationTmp.relatedTable
                ),
                joinColumnOptions: relationTmp.ownerColumns.map((v, idx) => {
                    const retVal: Required<JoinColumnOptions> = {
                        name: v,
                        referencedColumnName: relationTmp.relatedColumns[idx],
                    };
                    return retVal;
                }),
                relatedSchema: relationTmp.relatedTable.schema,
                relatedTable: relationTmp.relatedTable.tscName,
                relationType: isOneToMany ? "ManyToOne" : "OneToOne",
            };
            if (JSON.stringify(relationOptions) !== "{}") {
                ownerRelation.relationOptions = relationOptions;
            }
            const relatedRelation: Relation = {
                fieldName: ownerRelation.relatedField,
                schemaName: ownerRelation.relatedSchema,
                relatedField: ownerRelation.fieldName,
                relatedTable: relationTmp.ownerTable.tscName,
                relatedSchema: relationTmp.ownerTable.schema,
                relationType: isOneToMany ? "OneToMany" : "OneToOne",
            };

            ownerEntity.relations.push(ownerRelation);
            relationTmp.relatedTable.relations.push(relatedRelation);

            if (generationOptions.relationIds && ownerColumns.length === 1) {
                let relationIdFieldName = "";
                relationIdFieldName = TomgUtils.findNameForNewField(
                    ownerColumns[0].tscName,
                    ownerEntity
                );

                let fieldType = "";
                if (ownerRelation.relationType === "OneToMany") {
                    fieldType = `${ownerColumns[0].tscType}[]`;
                } else {
                    fieldType = ownerColumns[0].tscType;
                    if (ownerColumns[0].options.nullable) {
                        fieldType += " | null";
                    }
                }

                ownerEntity.relationIds.push({
                    fieldName: relationIdFieldName,
                    fieldType,
                    relationField: ownerRelation.fieldName,
                });
                // TODO: RelationId on ManyToMany
            }
        });
        return entities;
    }

    public static FindPrimaryColumnsFromIndexes(dbModel: Entity[]) {
        dbModel.forEach((entity) => {
            const primaryIndex = entity.indices.find((v) => v.primary);
            entity.columns
                .filter(
                    (col) =>
                        primaryIndex &&
                        primaryIndex.columns.some(
                            (cIndex) => cIndex === col.tscName
                        )
                )
                .forEach((col) => {
                    // eslint-disable-next-line no-param-reassign
                    col.primary = true;
                    if (col.options.unique) {
                        delete col.options.unique;
                    }
                });
            if (
                !entity.columns.some((v) => {
                    return !!v.primary;
                })
            ) {
                TomgUtils.LogError(`Table ${entity.tscName} has no PK.`, false);
            }
        });
    }

    protected static buildEscapedObjectList(dbNames: string[]) {
        return `'${dbNames.join("','")}'`;
    }

    public async GetDataFromServer(
        connectionOptions: IConnectionOptions,
        generationOptions: IGenerationOptions
    ): Promise<Entity[]> {
        let dbModel = [] as Entity[];
        await this.ConnectToServer(connectionOptions);
        dbModel = await this.GetAllTables(
            connectionOptions.schemaNames,
            connectionOptions.databaseNames
        );
        await this.GetCoulmnsFromEntity(
            dbModel,
            connectionOptions.schemaNames,
            connectionOptions.databaseNames
        );
        await this.GetIndexesFromEntity(
            dbModel,
            connectionOptions.schemaNames,
            connectionOptions.databaseNames
        );
        AbstractDriver.FindPrimaryColumnsFromIndexes(dbModel);
        dbModel = await this.GetRelations(
            dbModel,
            connectionOptions.schemaNames,
            connectionOptions.databaseNames,
            generationOptions
        );
        await this.DisconnectFromServer();
        dbModel = AbstractDriver.FindManyToManyRelations(dbModel);
        dbModel = AbstractDriver.FilterGeneratedTables(
            dbModel,
            connectionOptions.skipTables,
            connectionOptions.onlyTables
        );
        return dbModel;
    }

    public abstract ConnectToServer(
        connectionOptons: IConnectionOptions
    ): Promise<void>;

    public abstract GetAllTables(
        schemas: string[],
        dbNames: string[]
    ): Promise<Entity[]>;

    public abstract GetCoulmnsFromEntity(
        entities: Entity[],
        schemas: string[],
        dbNames: string[]
    ): Promise<Entity[]>;

    public abstract GetIndexesFromEntity(
        entities: Entity[],
        schemas: string[],
        dbNames: string[]
    ): Promise<Entity[]>;

    public abstract GetRelations(
        entities: Entity[],
        schemas: string[],
        dbNames: string[],
        generationOptions: IGenerationOptions
    ): Promise<Entity[]>;

    public abstract DisconnectFromServer(): Promise<void>;

    public abstract CreateDB(dbName: string): Promise<void>;

    public abstract DropDB(dbName: string): Promise<void>;

    public abstract CheckIfDBExists(dbName: string): Promise<boolean>;
}
