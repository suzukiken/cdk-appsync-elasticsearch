import * as cdk from "@aws-cdk/core";
import * as es from "@aws-cdk/aws-elasticsearch";
import * as appsync from "@aws-cdk/aws-appsync";
import * as iam from "@aws-cdk/aws-iam";
import * as ssm from "@aws-cdk/aws-ssm";

export class CdkappsyncElasticsearchStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ELASTICSEARCH_INDEX = "product-index";

    // const custom_endpoint = "elasticsearch.figment-research.com";

    // 1.83.0の時点ではこの値は動的にできなかった。
    // ssmやsmのパラメータストアで失敗するが、CDKコマンドのpropertyにすらできない
    // カスタムドメインにしてハードコードすればfromDomainEndpointは機能するが、今度はデータソースの登録でamazonaws.comでないからという理由で失敗する

    const endpoint =
      "https://search-cdkelasticsearch-xcqucvrf6gfqlztkgtfh4ayxoe.ap-northeast-1.es.amazonaws.com";

    const cdkelasticsearch_domain_arn = ssm.StringParameter.fromStringParameterName(
      this,
      "ssm_stringvalue_domain_arn",
      "cdkelasticsearch-domain-arn"
    ).stringValue;

    const domain = es.Domain.fromDomainEndpoint(
      this,
      "imported_domain",
      endpoint
    );

    // ---------------------

    const api = new appsync.GraphqlApi(this, "Api", {
      name: "cdkappsync-api",
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.IAM,
        },
      },
      schema: new appsync.Schema({
        filePath: "graphql/schema.graphql",
      }),
    });

    // Role for appsync that query Elasticsearch

    const appsync_es_role = new iam.Role(this, "appsync_es_role", {
      assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
      roleName: "cdkappsync-es-role",
    });

    const appsync_es_policy_statement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
    });

    appsync_es_policy_statement.addActions("es:ESHttpPost");
    appsync_es_policy_statement.addActions("es:ESHttpDelete");
    appsync_es_policy_statement.addActions("es:ESHttpHead");
    appsync_es_policy_statement.addActions("es:ESHttpGet");
    appsync_es_policy_statement.addActions("es:ESHttpPut");

    appsync_es_policy_statement.addResources(
      cdkelasticsearch_domain_arn + "/*"
    );

    const appsync_es_policy = new iam.Policy(this, "appsync_es_policy", {
      policyName: "cdkappsync-es-policy",
      statements: [appsync_es_policy_statement],
    });

    appsync_es_role.attachInlinePolicy(appsync_es_policy);

    // Register Elasticsearch as data source and resolvers

    const es_datasource = new appsync.CfnDataSource(this, "es_datasource", {
      apiId: api.apiId,
      name: "elasticsearch",
      type: "AMAZON_ELASTICSEARCH",
      elasticsearchConfig: {
        awsRegion: "ap-northeast-1",
        endpoint: domain.domainEndpoint,
      },
      serviceRoleArn: appsync_es_role.roleArn,
    });

    const es_search_resolver = new appsync.CfnResolver(
      this,
      "es_search_resolver",
      {
        apiId: api.apiId,
        typeName: "Query",
        fieldName: "searchProductEs",
        dataSourceName: es_datasource.name,
        requestMappingTemplate: `{
          "version":"2017-02-28",
          "operation":"GET",
          "path":"/${ELASTICSEARCH_INDEX}/_search",
          "params":{
            "body": {
              "from": 0,
              "size": 50,
              "query": {
                "match": {
                  "title": "$\{context.args.title\}"
                }
              }
            }
          }
        }`,
        responseMappingTemplate: `[
          #foreach($entry in $context.result.hits.hits)
            ## $velocityCount starts at 1 and increments with the #foreach loop **
            #if( $velocityCount > 1 ) , #end
            $util.toJson($entry.get("_source"))
          #end
        ]`,
      }
    );

    const es_all_resolver = new appsync.CfnResolver(this, "es_all_resolver", {
      apiId: api.apiId,
      typeName: "Query",
      fieldName: "listProductsEs",
      dataSourceName: es_datasource.name,
      requestMappingTemplate: `{
        "version":"2017-02-28",
        "operation":"GET",
        "path":"/${ELASTICSEARCH_INDEX}/_search",
        "params": {
          "body": {
            "query" : {
              "match_all" : {}
            }
          }
        }
      }`,
      responseMappingTemplate: `[
        #foreach($entry in $context.result.hits.hits)
          ## $velocityCount starts at 1 and increments with the #foreach loop **
          #if( $velocityCount > 1 ) , #end
          $util.toJson($entry.get("_source"))
        #end
      ]`,
    });

    // これが無いとNotFoundのエラーが出る
    es_search_resolver.addDependsOn(es_datasource);
    es_all_resolver.addDependsOn(es_datasource);
  }
}
