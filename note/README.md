+++
title = "AppSyncでElasticsearchにクエリをする"
date = "2021-05-02"
tags = ["AppSync", "Elasticsearch"]
+++

Amplifyが@searchable[やっている](https://docs.amplify.aws/cli/graphql-transformer/searchable)ようにElasticsearchをバックエンドにして検索をしようと思ったら、AppSyncのデータソースにElasticsearch Serviceを付け加えてリゾルバを用意することになる。

それを作ってみた。[Githubのリポジトリ](https://github.com/suzukiken/cdkappsync-elasticsearch)

ちなみにデータは取得（GraphQLのQuery）のみしか作っていない。というのもElasticsearchへのデータ投入はDynamo DBのstreamを受け取ったLambdaが行うという形をとれば良いだろうと思うからので、多分Amplifyで作られるバックエンドもそういう作りだと思っているが違うかもしれない。ともかく上のリポのリゾルバはQueryのみです。